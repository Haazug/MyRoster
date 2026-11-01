import {NextResponse} from 'next/server'
import {msfsShareUrl,MAX_IMPORT_BYTES} from '@/lib/route-import'
export async function POST(request:Request){
 try{
  if(Number(request.headers.get('content-length'))>4096)return NextResponse.json({error:'invalid'},{status:400})
  const body=await request.text();if(body.length>4096)return NextResponse.json({error:'invalid'},{status:400})
  const url=msfsShareUrl(JSON.parse(body).url)
  // Fixed public host only. Never forward user cookies or follow authentication redirects.
  const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(15000),headers:{Accept:'application/json, application/xml, text/xml, text/plain'},cache:'no-store'})
  if(response.status>=300&&response.status<400||response.status===401||response.status===403)return NextResponse.json({error:'authentication'},{status:422})
  if(!response.ok)return NextResponse.json({error:'unavailable'},{status:502})
  const reader=response.body?.getReader();if(!reader)throw Error('Empty plan')
  const chunks:Uint8Array[]=[];let size=0
  for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_IMPORT_BYTES){await reader.cancel();throw Error('Too large')}chunks.push(value)}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
  const content=new TextDecoder().decode(bytes)
  if(/<!doctype html|<html[\s>]/i.test(content))return NextResponse.json({error:'authentication'},{status:422})
  return NextResponse.json({content})
 }catch{return NextResponse.json({error:'invalid'},{status:400})}
}
