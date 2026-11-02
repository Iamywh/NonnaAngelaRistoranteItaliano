// Dependency-free Office Open XML .xlsx (ZIP STORE). No external CDNs, no formulas.
// All user-supplied text is emitted as inlineStr to prevent spreadsheet formula injection.
const encoder=new TextEncoder()
const escapeXml=value=>String(value??'')
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&apos;')
const xlsxCol=index=>{
  let n=index+1,out=''
  while(n>0){n--;out=String.fromCharCode(65+n%26)+out;n=Math.floor(n/26)}
  return out
}
function worksheet(rows,moneyColumns=new Set(),integerColumns=new Set()){
  let body=''
  for(let i=0;i<rows.length;i++){
    const cells=rows[i].map((value,j)=>{
      if(value==null)return ''
      const address=xlsxCol(j)+(i+1)
      if(typeof value==='number'&&Number.isFinite(value)){
        const style=moneyColumns.has(j)?' s="2"':integerColumns.has(j)?' s="3"':''
        return '<c r="'+address+'"'+style+'><v>'+value+'</v></c>'
      }
      return '<c r="'+address+'" s="'+(i===0?1:0)+'" t="inlineStr"><is><t xml:space="preserve">'+escapeXml(value)+'</t></is></c>'
    }).join('')
    body+='<row r="'+(i+1)+'">'+cells+'</row>'
  }
  const maxWidth=rows[0]?.map((_,i)=>Math.max(14,Math.min(40,
    ...rows.slice(0,200).map(row=>String(row[i]??'').length+3))))||[]
  const cols=maxWidth.map((width,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+width+'" customWidth="1"/>').join('')
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'+
    '<cols>'+cols+'</cols><sheetData>'+body+'</sheetData></worksheet>'
}
const styles='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
  '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00 &quot;€&quot;"/></numFmts>'+
  '<fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Aptos"/></font></fonts>'+
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF264D43"/><bgColor indexed="64"/></patternFill></fill></fills>'+
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'+
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'+
  '<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'+
  '<xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyFill="1" applyFont="1"/>'+
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'+
  '<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>'+
  '</styleSheet>'
const cells=(report)=>{
  const m=report.months
  const summary=[
    ['NONNA ANGELA - REPORTE DE GESTION','Valor'],
    ['Período',m[0].month+' a '+m[m.length-1].month],
    ['Fecha de generación (UTC)',report.generatedAt],
    ['Meses en el reporte',m.length],
    ['Meses con cierre gerencial',report.summary.closedMonths],
    ['Meses con ventas verificadas',report.summary.verifiedMonths],
    ['Meses sin datos',report.summary.missingMonths],
    ['Total de ingresos comparable',report.summary.revenueTotal],
    ['Base fiscal del total',report.summary.revenueBasis||'No comparable'],
    ['IMPORTANTE','El total general solo aparece si todos los meses estan verificados y tienen la misma base fiscal.'],
    ['Aviso','Los resultados operativos proceden SOLO de cierres guardados, no son beneficio contable/fiscal.'],
    ['Aviso','Los gastos de compras no se vuelven a restar del consumo del inventario.'],
    ['Aviso','Meses estimados, parciales y ausentes no se suman a los totales.']
  ]
  const months=[['Mes','Estado','Origen','Base fiscal','Ingresos','Comensales','Ticket medio','Objetivo ventas','Diferencia objetivo','Gastos registrados','Base gastos','Consumo alimentos NETO','Consumo bebidas NETO','Otros gastos NETOS','Resultado operativo cierre NETO','Verificación cierre','Días registrados','Días finalizados','Días del mes']]
  for(const x of m)months.push([
    x.month,x.status,x.source,x.basis||'',x.revenue,x.covers,x.ticket,
    x.target,x.targetDelta,x.expenseTotal,x.expenseBasis||'',
    x.foodConsumption,x.beverageConsumption,x.otherExpenses,x.operatingResult,
    x.closureStatus||'No aplica',x.recordedDays,x.finalizedDays,x.daysInMonth
  ])
  const expenses=[['Mes','Período','Periodicidad','Categoría','Base fiscal','Importe registrado']]
  for(const x of m)for(const e of x.expenseRows)
    expenses.push([e.month,e.period,e.periodKind,e.category,e.basis,e.amount])
  const warnings=[['Mes','Estado','Aviso / limitación']]
  for(const x of m)if(!x.warnings.length)warnings.push([x.month,x.status,'Sin avisos adicionales registrados'])
  else for(const warning of x.warnings)warnings.push([x.month,x.status,warning])
  return [
    {name:'Resumen',rows:summary,money:new Set([1])},
    {name:'Meses',rows:months,money:new Set([4,6,7,8,9,11,12,13,14]),integer:new Set([5,16,17,18])},
    {name:'Gastos',rows:expenses,money:new Set([5])},
    {name:'Avisos',rows:warnings}
  ]
}
function crc32(bytes){
  let crc=0xffffffff
  for(const byte of bytes){
    crc^=byte
    for(let k=0;k<8;k++)crc=crc&1?(crc>>>1)^0xedb88320:crc>>>1
  }
  return (crc^0xffffffff)>>>0
}
function zipStore(files){
  const pieces=[],records=[]
  let offset=0
  for(const [path,source] of files){
    const name=encoder.encode(path),data=encoder.encode(source),crc=crc32(data)
    const h=new Uint8Array(30+name.length)
    const dv=new DataView(h.buffer)
    dv.setUint32(0,0x04034b50,true)
    dv.setUint16(4,20,true);dv.setUint16(6,0x0800,true)
    dv.setUint32(14,crc,true);dv.setUint32(18,data.length,true);dv.setUint32(22,data.length,true)
    dv.setUint16(26,name.length,true)
    h.set(name,30)
    pieces.push(h,data)
    records.push({name,dataLength:data.length,crc,offset})
    offset+=h.length+data.length
  }
  const startCentral=offset
  for(const r of records){
    const h=new Uint8Array(46+r.name.length)
    const dv=new DataView(h.buffer)
    dv.setUint32(0,0x02014b50,true)
    dv.setUint16(4,20,true);dv.setUint16(6,20,true)
    dv.setUint16(8,0x0800,true)
    dv.setUint32(16,r.crc,true);dv.setUint32(20,r.dataLength,true);dv.setUint32(24,r.dataLength,true)
    dv.setUint16(28,r.name.length,true);dv.setUint32(42,r.offset,true)
    h.set(r.name,46)
    pieces.push(h);offset+=h.length
  }
  const end=new Uint8Array(22),dv=new DataView(end.buffer)
  dv.setUint32(0,0x06054b50,true)
  dv.setUint16(8,records.length,true);dv.setUint16(10,records.length,true)
  dv.setUint32(12,offset-startCentral,true);dv.setUint32(16,startCentral,true)
  pieces.push(end);offset+=end.length
  const result=new Uint8Array(offset)
  let position=0
  for(const p of pieces){result.set(p,position);position+=p.length}
  return result
}
export function createAnalyticsXlsx(report){
  if(!report?.months?.length)throw Error('No hay meses para exportar')
  const sheets=cells(report)
  const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
  const packageTypes='<?xml version="1.0" encoding="UTF-8"?>'+
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
    '<Default Extension="xml" ContentType="application/xml"/>'+
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+
    sheets.map((s,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>'
  const rels='<?xml version="1.0" encoding="UTF-8"?>'+
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
  const workbook='<?xml version="1.0" encoding="UTF-8"?>'+
    '<workbook xmlns="'+ns+'" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'+
    '<sheets>'+sheets.map((s,i)=>'<sheet name="'+escapeXml(s.name)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets></workbook>'
  const bookRels='<?xml version="1.0" encoding="UTF-8"?>'+
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
    sheets.map((s,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+
    '<Relationship Id="rId'+(sheets.length+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'
  const files=[
    ['[Content_Types].xml',packageTypes],['_rels/.rels',rels],
    ['xl/workbook.xml',workbook],['xl/_rels/workbook.xml.rels',bookRels],
    ['xl/styles.xml',styles],
    ...sheets.map((s,i)=>['xl/worksheets/sheet'+(i+1)+'.xml',worksheet(s.rows,s.money,s.integer)])
  ]
  return zipStore(files)
}
