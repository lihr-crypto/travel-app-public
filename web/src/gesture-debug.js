// PROTOTYPE platform adapter for diagnostic logging only. No business writes.
const entries = [];
export function glog(line) {
  entries.push({ timestamp: Date.now(), line });
  if (entries.length > 100) entries.shift();
}

