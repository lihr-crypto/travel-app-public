/* global test,expect */
const {invitationUrl,signInPath}=require('../src/invite-link');
test('first-time hosted invite enters sign-in with the complete join fragment',()=>{
 const token='public-invitation-test';const link=new URL(invitationUrl('https://private.example',token));
 expect(link.pathname).toBe('/signin-with-chatgpt');expect(link.searchParams.get('return_to')).toBe(`/join#${token}`);
 const returned=new URL(link.searchParams.get('return_to'),link.origin);expect(returned.pathname).toBe('/join');expect(returned.hash).toBe(`#${token}`);
});
test('local preview keeps direct invitations and sign-in rejects external or reserved return paths',()=>{
 expect(invitationUrl('http://127.0.0.1:8098','public-test')).toBe('http://127.0.0.1:8098/join#public-test');
 for(const target of ['https://other.example/','//other.example/','/signin-with-chatgpt','/callback'])expect(new URL(signInPath(target),'https://private.example').searchParams.get('return_to')).toBe('/');
});
test('session recovery loads an uncached entry then restores the full trip or invitation route',()=>{
 const {freshSignInPath,recoveryReturnPath}=require('../src/invite-link');
 for(const target of ['/trip/public/day/day-1','/join#public-token']){
  const login=new URL(freshSignInPath(target),'https://private.example');const fresh=new URL(login.searchParams.get('return_to'),login.origin);
  expect(fresh.pathname).toBe('/install');expect(recoveryReturnPath(fresh)).toBe(target);
 }
 for(const target of ['https://other.example/','//other.example/','/signin-with-chatgpt']){
  expect(recoveryReturnPath(new URL(`https://private.example/install?return_to=${encodeURIComponent(target)}`))).toBe('/');
 }
});
