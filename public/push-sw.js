/* MyRoster push only: no fetch interception, page caching or offline routing. */
'use strict'
function ownerStore(mode,operation){
 return new Promise((resolve,reject)=>{
  const open=indexedDB.open('myroster-push',1)
  open.onupgradeneeded=()=>open.result.createObjectStore('settings')
  open.onerror=()=>reject(open.error)
  open.onsuccess=()=>{
   const db=open.result,tx=db.transaction('settings',mode),request=operation(tx.objectStore('settings'))
   tx.oncomplete=()=>{db.close();resolve(request.result)}
   tx.onabort=tx.onerror=()=>{db.close();reject(tx.error)}
  }
 })
}
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()))
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()))
self.addEventListener('message',event=>{
 if(event.data?.type!=='myroster:push-owner')return
 // A page may associate only its own origin's registration with the signed-in account.
 if(!event.source?.url||new URL(event.source.url).origin!==self.location.origin)return
 event.waitUntil(ownerStore('readwrite',s=>event.data.owner?s.put(event.data.owner,'owner'):s.delete('owner')).then(()=>event.ports[0]?.postMessage({ok:true})).catch(()=>event.ports[0]?.postMessage({ok:false})))
})
self.addEventListener('push',event=>{
 event.waitUntil((async()=>{
  let payload;try{payload=event.data?.json()}catch{return}
  if(!payload||typeof payload.title!=='string'||typeof payload.body!=='string'||!Number.isFinite(payload.expiresAt)||payload.expiresAt<Date.now())return
  const owner=await ownerStore('readonly',s=>s.get('owner'))
  if(!owner||owner.userId!==payload.userId||owner.subscriptionId!==payload.subscriptionId)return
  await self.registration.showNotification(payload.title.slice(0,180),{
   body:payload.body.slice(0,300),silent:false,tag:String(payload.tag||'myroster').slice(0,250),
   icon:'/brand/myroster-icon-192-v223-fix.png',badge:'/brand/myroster-icon-192-v223-fix.png',
   data:{url:payload.url==='/trips'?'/trips':'/profile#notifications'},
  })
 })())
})
self.addEventListener('notificationclick',event=>{
 event.notification.close()
 event.waitUntil((async()=>{
  const path=event.notification.data?.url==='/trips'?'/trips':'/profile#notifications'
  const target=new URL(path,self.location.origin).href
  const pages=await self.clients.matchAll({type:'window',includeUncontrolled:true})
  for(const client of pages){if(new URL(client.url).origin===self.location.origin&&'navigate' in client){await client.navigate(target);await client.focus();return}}
  await self.clients.openWindow(target)
 })())
})
