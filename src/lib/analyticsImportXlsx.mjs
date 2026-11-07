// Read-only Excel .xlsx first worksheet importer. Modern browser native ZIP deflate.
// No scripts, formulas, external data or third-party CDN. Strict file/decompression caps.
import {validateImportTable} from './analyticsImport.mjs'
const LIMIT=2_000_000
const decoder=new TextDecoder('utf-8',{fatal:true})
const u16=(d,i)=>d.getUint16(i,true)
const u32=(d,i)=>d.getUint32(i,true)
function archiveEntries(bytes) {
  const d=new DataView(bytes),a=new Uint8Array(bytes)
  if(bytes.byteLength>LIMIT)throw Error('XLSX supera 2 MB')
  let end=-1
  for(let i=bytes.byteLength-22;i>=Math.max(0,bytes.byteLength-65557);i--) {
    if(u32(d,i)===0x06054b50){end=i;break}
  }
  if(end<0)throw Error('Archivo XLSX ZIP no reconocido')
  const count=u16(d,end+10),offset=u32(d,end+16)
  if(count>400||offset>=bytes.byteLength)throw Error('Archivo XLSX demasiado complejo')
  const files=new Map()
  let i=offset
  for(let n=0;n<count;n++){
    if(i+46>bytes.byteLength||u32(d,i)!==0x02014b50)throw Error('ZIP central incompleto')
    const flags=u16(d,i+8),method=u16(d,i+10)
    const size=u32(d,i+20),expanded=u32(d,i+24)
    const nameLen=u16(d,i+28),extra=u16(d,i+30),comment=u16(d,i+32)
    const local=u32(d,i+42)
    if((flags&1)!==0||![0,8].includes(method))throw Error('XLSX cifrado o compresión no admitida')
    if(i+46+nameLen+extra+comment>bytes.byteLength)throw Error('ZIP dañado')
    const name=decoder.decode(a.subarray(i+46,i+46+nameLen))
    if(!name.includes('..')&&!name.startsWith('/')&&
       (name.endsWith('.xml')||name.endsWith('.rels'))) {
      if(expanded>LIMIT||size>LIMIT)throw Error('XML XLSX demasiado grande')
      if(local+30>bytes.byteLength||u32(d,local)!==0x04034b50)throw Error('ZIP local inválido')
      const start=local+30+u16(d,local+26)+u16(d,local+28)
      if(start+size>bytes.byteLength)throw Error('ZIP truncado')
      files.set(name,{method,size,expanded,start})
    }
    i+=46+nameLen+extra+comment
  }
  return {bytes:a,files}
}
async function readXmlZip(zip,path) {
  const item=zip.files.get(path)
  if(!item)throw Error('Falta parte XLSX: '+path)
  const input=zip.bytes.subarray(item.start,item.start+item.size)
  let data
  if(item.method===0) data=input
  else {
    if(typeof DecompressionStream!=='function')throw Error('Este navegador no admite XLSX; usa CSV')
    const stream=new Blob([input]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
    const reader=stream.getReader(),parts=[]
    let size=0
    try {
      while(true){
        const {value,done}=await reader.read()
        if(done)break
        size+=value.byteLength
        if(size>LIMIT)throw Error('XML XLSX descomprimido demasiado grande')
        parts.push(value)
      }
    } finally {await reader.cancel().catch(()=>{})}
    data=new Uint8Array(size);let pos=0
    for(const p of parts){data.set(p,pos);pos+=p.length}
  }
  if(data.byteLength>LIMIT)throw Error('XML XLSX demasiado grande')
  return decoder.decode(data)
}
function xmlDoc(text) {
  const xml=new DOMParser().parseFromString(text,'application/xml')
  if(xml.getElementsByTagName('parsererror').length)throw Error('XML XLSX inválido')
  return xml
}
const nodes=(node,name)=>Array.from(node.getElementsByTagNameNS('*',name))
const first=(node,name)=>nodes(node,name)[0]||null
function normalizeSheet(path) {
  const parts=[]
  for(const section of path.split('/')){
    if(section==='..')parts.pop()
    else if(section&&section!=='.')parts.push(section)
  }
  const result=parts.join('/')
  if(!result.startsWith('xl/'))throw Error('Ruta de hoja XLSX no válida')
  return result
}
function sheetPath(workbook,rels) {
  const sheet=first(workbook,'sheet')
  if(!sheet)throw Error('No hay hojas XLSX')
  const id=sheet.getAttribute('r:id')||
    sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id')
  const match=nodes(rels,'Relationship').find(r=>r.getAttribute('Id')===id)
  if(!match||match.getAttribute('TargetMode')==='External')throw Error('Hoja XLSX inválida')
  const target=match.getAttribute('Target')||''
  return normalizeSheet(target.startsWith('/')?target.slice(1):target.startsWith('xl/')?target:'xl/'+target)
}
function colIndex(ref) {
  const match=/^([A-Z]+)[0-9]+$/.exec(ref)
  if(!match)return -1
  let idx=0
  for(const ch of match[1])idx=idx*26+ch.charCodeAt(0)-64
  return idx-1
}
function extractRow(row,shared,width) {
  const cells=Array(width).fill('')
  for(const cell of nodes(row,'c')){
    const idx=colIndex(cell.getAttribute('r')||'')
    if(idx<0)continue
    if(idx>=width) {
      if((cell.textContent||'').trim())throw Error('Columnas extra en hoja XLSX')
      continue
    }
    if(nodes(cell,'f').length)throw Error('Fórmulas XLSX no permitidas: usa valores fijos')
    const type=cell.getAttribute('t')
    if(type==='e')throw Error('Celda con error Excel')
    let value=''
    if(type==='inlineStr')value=nodes(cell,'t').map(x=>x.textContent||'').join('')
    else {
      const v=first(cell,'v')?.textContent||''
      if(type==='s'){
        const n=Number(v)
        if(!Number.isInteger(n)||n<0||n>=shared.length)throw Error('Cadena Excel inválida')
        value=shared[n]
      } else value=v
    }
    cells[idx]=value
  }
  return cells
}
export async function parseImportXlsx(arrayBuffer,kind,headers) {
  if(!(arrayBuffer instanceof ArrayBuffer))throw Error('Archivo XLSX inválido')
  if(!Array.isArray(headers))throw Error('Cabeceras no proporcionadas')
  const zip=archiveEntries(arrayBuffer)
  const workbook=xmlDoc(await readXmlZip(zip,'xl/workbook.xml'))
  const rels=xmlDoc(await readXmlZip(zip,'xl/_rels/workbook.xml.rels'))
  const path=sheetPath(workbook,rels)
  let shared=[]
  if(zip.files.has('xl/sharedStrings.xml')){
    const sharedDoc=xmlDoc(await readXmlZip(zip,'xl/sharedStrings.xml'))
    shared=nodes(sharedDoc,'si').map(si=>nodes(si,'t').map(t=>t.textContent||'').join(''))
    if(shared.length>10000)throw Error('Demasiadas cadenas XLSX')
  }
  const sheet=xmlDoc(await readXmlZip(zip,path))
  const sheetData=first(sheet,'sheetData')
  if(!sheetData)throw Error('Hoja XLSX vacía')
  const table=[]
  const rows=nodes(sheetData,'row')
  if(rows.length>61)throw Error('Máximo 60 registros por archivo')
  for(const row of rows) {
    const cells=extractRow(row,shared,headers.length)
    if(cells.some(s=>String(s).trim()))table.push(cells)
  }
  return validateImportTable(table,kind)
}
