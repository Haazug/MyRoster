export function globeNavAllowed(path:string,inFlight:boolean){
 if(inFlight)return true
 return path==='/'||/^\/route\/[^/]+\/[^/]+/.test(path)||/^\/airlines\/[^/]+/.test(path)||/^\/airports\/[^/]+/.test(path)
}
