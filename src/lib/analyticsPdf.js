// Browser-only PDF generator, using dependencies already installed in this website.
const money=value=>value==null?'--':new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(value)
const count=value=>value==null?'--':new Intl.NumberFormat('es-ES').format(value)
const states={
 closed:'Cierre gerencial',verified:'Historico verificado',
 complete:'Diario completo',partial:'PARCIAL',estimated:'ESTIMACION',missing:'SIN DATOS'
}
const ascii=s=>String(s).replace(/[–—]/g,'-').replace(/[\u2022]/g,'-')
export async function downloadAnalyticsPdf(report,fileName){
  if(!report?.months?.length)throw Error('Sin datos para crear PDF')
  const [{jsPDF},{default:autoTable}]=await Promise.all([
    import('jspdf'),import('jspdf-autotable')
  ])
  const doc=new jsPDF({unit:'mm',format:'a4',compress:true})
  const width=210, left=16,right=194
  const first=report.months[0].month,last=report.months.at(-1).month
  doc.setFillColor(28,60,53)
  doc.rect(0,0,210,37,'F')
  doc.setTextColor(255,255,255)
  doc.setFont('helvetica','bold');doc.setFontSize(18)
  doc.text('NONNA ANGELA',left,17)
  doc.setFontSize(10);doc.setFont('helvetica','normal')
  doc.text('Informe financiero de gestion | '+first+' - '+last,left,26)
  doc.setTextColor(36,36,36)
  doc.setFontSize(9)
  doc.text('Generado: '+new Date(report.generatedAt).toLocaleString('es-ES',{timeZone:'Atlantic/Canary'}),left,44)
  doc.setFont('helvetica','bold')
  const total=report.summary.revenueTotal==null
    ?'NO COMPARABLE - meses incompletos o bases fiscales diferentes'
    :money(report.summary.revenueTotal)+' ('+report.summary.revenueBasis+')'
  doc.text('Total de ingresos consolidados: ',left,53)
  doc.setFont('helvetica','normal')
  const summaryText=doc.splitTextToSize(ascii(total),116)
  doc.text(summaryText,79,53)
  let y=Math.max(64,53+summaryText.length*4.5)
  doc.setFontSize(9)
  doc.text('Meses con cierre: '+report.summary.closedMonths+
    ' | Con ventas verificadas: '+report.summary.verifiedMonths+
    ' | Sin datos: '+report.summary.missingMonths,left,y)
  y+=7
  const rows=report.months.map(m=>[
    m.month,states[m.status],m.basis||'--',
    money(m.revenue),count(m.covers),money(m.ticket),
    money(m.target),money(m.targetDelta)
  ])
  autoTable(doc,{
    startY:y,margin:{left,right:16},theme:'striped',
    styles:{fontSize:7.2,cellPadding:2.2,overflow:'linebreak'},
    headStyles:{fillColor:[38,77,67],textColor:[255,255,255]},
    head:[['Mes','Estado','Base','Ingresos','Pax','Ticket','Objetivo','Diferencia']],
    body:rows,
    columnStyles:{0:{cellWidth:18},1:{cellWidth:26},2:{cellWidth:13},
      3:{cellWidth:28},4:{cellWidth:12},5:{cellWidth:23},6:{cellWidth:24},7:{cellWidth:24}}
  })
  y=doc.lastAutoTable.finalY+10
  if(y>250){doc.addPage();y=20}
  doc.setFont('helvetica','bold');doc.setFontSize(11);doc.text('Resultados de cierres guardados',left,y)
  y+=3
  const closeRows=report.months.filter(m=>m.status==='closed').map(m=>[
    m.month,money(m.revenue),money(m.foodConsumption),
    money(m.beverageConsumption),money(m.otherExpenses),
    money(m.operatingResult),
    m.closureStatus==='changed'?'CAMBIADO':
      m.closureStatus==='consistent'?'Coincide':'No comprobado'
  ])
  if(closeRows.length){
    autoTable(doc,{
      startY:y,margin:{left:16,right:16},theme:'grid',
      styles:{fontSize:7,cellPadding:2.3},
      headStyles:{fillColor:[38,77,67]},
      head:[['Mes','Ventas netas','Food','Bebidas','Otros gastos','Resultado gestion','Fuente']],
      body:closeRows
    })
    y=doc.lastAutoTable.finalY+10
  }else{
    y+=7;doc.setFont('helvetica','normal');doc.setFontSize(9)
    doc.text('No hay meses con cierre gerencial registrado.',left,y);y+=10
  }
  if(y>246){doc.addPage();y=22}
  doc.setFont('helvetica','bold');doc.setFontSize(11);doc.text('Avisos y limitaciones',left,y);y+=4
  const alerts=report.months.flatMap(m=>m.warnings.map(w=>[m.month,ascii(w)]))
  autoTable(doc,{
    startY:y,margin:{left:16,right:16},theme:'plain',
    styles:{fontSize:8,cellPadding:2,overflow:'linebreak'},
    headStyles:{fillColor:[238,233,224],textColor:[34,34,34]},
    head:[['Mes','Advertencia / contexto']],
    body:alerts.length?alerts:[['Todos','Sin advertencias adicionales.']],
    columnStyles:{0:{cellWidth:26}}
  })
  y=doc.lastAutoTable.finalY+10
  if(y>240){doc.addPage();y=22}
  doc.setFont('helvetica','bold');doc.setFontSize(10)
  doc.text('Criterios del informe',left,y)
  doc.setFont('helvetica','normal');doc.setFontSize(8)
  const notes=[
    'No se suman Historico, Diario y Cierre del mismo mes. Solo se utiliza una fuente.',
    'Los meses parciales y estimados NO se incluyen en el total consolidado.',
    'Los gastos registrados no acreditan por si solos el cierre completo de un mes.',
    'El resultado operativo de gestion procede solo de cierres guardados.',
    'Un resultado operativo NO equivale a beneficio fiscal ni a flujo de caja.',
    'Los importes brutos y netos de IGIC no se suman sin conciliacion.'
  ]
  for(const note of notes){
    const lines=doc.splitTextToSize('- '+ascii(note),176)
    if(y+lines.length*4>274){doc.addPage();y=22}
    doc.text(lines,left,y+6);y+=lines.length*4.5+3
  }
  const pages=doc.getNumberOfPages()
  for(let page=1;page<=pages;page++){
    doc.setPage(page)
    doc.setDrawColor(210,210,210);doc.line(16,281,194,281)
    doc.setFont('helvetica','normal');doc.setFontSize(7.5)
    doc.text('NONNA ANGELA | Uso interno y confidencial | No es un estado contable certificado',16,287)
    doc.text(page+' / '+pages,193,287,{align:'right'})
  }
  doc.save(fileName||'nonna_angela_reporte.pdf')
}
