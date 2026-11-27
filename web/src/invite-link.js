const authPaths=new Set(['/signin-with-chatgpt','/signout-with-chatgpt','/callback']);
/** Use Sites' supported relative return path, including the invite fragment. */
export function signInPath(returnTo='/'){
 let safe='/';
 if(typeof returnTo==='string'&&returnTo.startsWith('/')&&!returnTo.startsWith('//')){
  try{const url=new URL(returnTo,'https://relative.invalid');
   if(url.origin==='https://relative.invalid'&&!authPaths.has(url.pathname))safe=`${url.pathname}${url.search}${url.hash}`;
  }catch{ /* malformed return paths stay at Home */ }
 }
 return `/signin-with-chatgpt?return_to=${encodeURIComponent(safe)}`;
}
export function invitationUrl(origin,token){
 const base=new URL(origin),target=`/join#${token}`;
 // The loopback preview has a local actor adapter and no hosted sign-in route.
 return new URL(['localhost','127.0.0.1'].includes(base.hostname)?target:signInPath(target),base.origin).href;
}

/** Reload through the existing uncached entry after sign-in, retaining the app route. */
export function freshSignInPath(returnTo='/') {
 const safe=new URL(signInPath(returnTo),'https://relative.invalid').searchParams.get('return_to');
 if(new URL(safe,'https://relative.invalid').pathname==='/install'||safe==='/')return signInPath('/install');
 return signInPath(`/install?return_to=${encodeURIComponent(safe)}`);
}
export function recoveryReturnPath(location) {
 if(location.pathname!=='/install')return null;
 const target=new URLSearchParams(location.search).get('return_to');
 if(!target)return null;
 const safe=new URL(signInPath(target),'https://relative.invalid').searchParams.get('return_to');
 return new URL(safe,'https://relative.invalid').pathname==='/install'?'/':safe;
}
