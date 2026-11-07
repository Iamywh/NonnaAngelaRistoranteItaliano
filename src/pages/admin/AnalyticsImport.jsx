import React, {useMemo,useState} from 'react'
import {supabase} from '../../lib/supabaseClient.js'
import {IMPORT_HEADERS,importCsvTemplate,parseImportCsv} from '../../lib/analyticsImport.mjs'
import {parseImportXlsx} from '../../lib/analyticsImportXlsx.mjs'

const STATUS_LABELS = {
  ready:'Lista para importar',
  exists:'Ya existe: NO se sobrescribirá',
  closed_month:'Mes cerrado: bloqueada'
}
const formatNumber=n=>new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(Number(n)||0)
export default function AnalyticsImport() {
  const [kind,setKind]=useState('daily')
  const [rows,setRows]=useState([])
  const [fileName,setFileName]=useState('')
  const [preview,setPreview]=useState(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const [fileKey,setFileKey]=useState(0)
  const [understood,setUnderstood]=useState(false)
  const ready=Boolean(preview && preview.row_count===rows.length &&
    preview.ready_count===rows.length && preview.entries?.every(e=>e.status==='ready'))
  const totals=useMemo(()=>kind==='expenses'?
    rows.reduce((sum,r)=>sum+r.value.amount,0):
    rows.reduce((sum,r)=>sum+r.value.lunch.food+r.value.lunch.beverage+
      r.value.dinner.food+r.value.dinner.beverage,0),[rows,kind])
  const reset=()=>{
    setRows([]);setFileName('');setPreview(null);setError('');setMessage('')
    setUnderstood(false);setFileKey(k=>k+1)
  }
  const changeKind=next=>{setKind(next);reset()}
  const downloadTemplate=()=>{
    const csv=importCsvTemplate(kind)
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}))
    const link=document.createElement('a')
    link.href=url;link.download=kind==='daily'?'nonna_analytics_dias.csv':'nonna_analytics_gastos.csv'
    document.body.appendChild(link);link.click();link.remove()
    URL.revokeObjectURL(url)
  }
  const loadFile=async(event)=>{
    const file=event.target.files?.[0]
    reset()
    if(!file)return
    if(file.size>2_000_000){setError('Archivo demasiado grande. Máximo 2 MB.');return}
    const name=file.name.toLowerCase()
    if(!name.endsWith('.csv')&&!name.endsWith('.xlsx')){
      setError('Utiliza un archivo .csv o .xlsx.');return
    }
    setBusy(true)
    try {
      const parsed=name.endsWith('.csv')?
        parseImportCsv(await file.text(),kind):
        await parseImportXlsx(await file.arrayBuffer(),kind,IMPORT_HEADERS[kind])
      setRows(parsed)
      setFileName(file.name)
      setMessage(parsed.length+' registros válidos en el archivo. Solicita la vista previa del servidor.')
    } catch(e) {setError(e.message||'Error al leer el archivo')} finally {setBusy(false)}
  }
  const check=async()=>{
    setError('');setMessage('');setPreview(null);setUnderstood(false)
    if(!rows.length)return
    setBusy(true)
    const {data,error:rpcError}=await supabase.rpc('analytics_import_register_batch',{
      p_kind:kind,p_rows:rows.map(r=>r.value),p_preview:true
    })
    setBusy(false)
    if(rpcError){setError('Vista previa rechazada: '+rpcError.message);return}
    if(!data?.ok||data.row_count!==rows.length){
      setError('El servidor devolvió una validación incompleta.');return
    }
    setPreview(data)
    if(data.ready_count!==rows.length){
      setError('Hay fechas/categorías ya registradas o meses cerrados. No se puede importar este lote.')
    } else setMessage('Vista previa verificada: todos los registros son nuevos.')
  }
  const apply=async()=>{
    if(!ready||!understood||busy)return
    if(!window.confirm('¿Importar '+rows.length+' registros NUEVOS? La operación quedará auditada. No se sobrescribirá nada.'))return
    setError('');setMessage('');setBusy(true)
    const {data,error:rpcError}=await supabase.rpc('analytics_import_register_batch',{
      p_kind:kind,p_rows:rows.map(r=>r.value),p_preview:false
    })
    setBusy(false)
    if(rpcError){
      setPreview(null);setUnderstood(false)
      setError('Importación cancelada sin guardar el lote: '+rpcError.message)
      return
    }
    if(!data?.ok||data.row_count!==rows.length){
      setPreview(null);setUnderstood(false)
      setError('Respuesta incompleta: verifica Analytics antes de volver a intentar.')
      return
    }
    const count=data.row_count
    reset()
    setMessage('✅ '+count+' registros importados. Comprueba Registro diario o Gastos; nunca se finalizan automáticamente.')
  }
  const displayRow=r=>kind==='expenses'?[
    r.value.date,r.value.category,formatNumber(r.value.amount),r.value.basis
  ]:[
    r.value.date,r.value.lunch.status+' / '+r.value.dinner.status,
    r.value.lunch.covers+r.value.dinner.covers,formatNumber(
      r.value.lunch.food+r.value.lunch.beverage+r.value.dinner.food+r.value.dinner.beverage)
  ]
  return <div style={{display:'grid',gap:16}}>
    <div className="dashboard-panel">
      <h3>Importación de datos · CSV / Excel (.xlsx)</h3>
      <p>Importa SOLO registros nuevos. No sustituye días existentes (ni borradores), gastos existentes ni meses cerrados. No convierte IGIC automáticamente.</p>
      <p><strong>Histórico mensual:</strong> sigue en la pestaña Histórico. Este módulo importa el registro diario de ingresos o los totales de gastos por categoría.</p>
      <div style={{display:'flex',gap:12,flexWrap:'wrap',margin:'14px 0'}}>
        <button type="button" className={kind==='daily'?'primary-button':'ghost-button'} onClick={()=>changeKind('daily')} disabled={busy}>Días y servicios</button>
        <button type="button" className={kind==='expenses'?'primary-button':'ghost-button'} onClick={()=>changeKind('expenses')} disabled={busy}>Gastos por categoría</button>
      </div>
      <p>Descarga la plantilla CSV, complétala en Excel o LibreOffice y guarda como CSV o XLSX. Mantén las cabeceras exactas. Las fechas deben ser texto ISO AAAA-MM-DD, nunca números seriales Excel.</p>
      <p>Formato: <strong>gross</strong> = importe bruto; <strong>net</strong> = importe neto. En un servicio cerrado, coperti e importes son 0. La base IGIC desconocida se deja vacía en gastos.</p>
      <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center'}}>
        <button type="button" className="ghost-button" onClick={downloadTemplate}>Descargar plantilla {kind==='daily'?'días':'gastos'}</button>
        <label>Archivo CSV o XLSX (hasta 60 filas)
          <input key={fileKey} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={loadFile}/>
        </label>
      </div>
      {fileName&&<p><strong>Archivo:</strong> {fileName} · {rows.length} filas · {formatNumber(totals)} sin normalización fiscal</p>}
      {error&&<p role="alert" className="manager-error">{error}</p>}
      {message&&<p role="status">{message}</p>}
    </div>
    {rows.length>0&&<div className="dashboard-panel">
      <h3>1. Vista previa local</h3>
      <p>Los importes han pasado la validación del navegador. El servidor comprobará permisos, duplicados y cierres antes de permitir guardar.</p>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',textAlign:'left',borderCollapse:'collapse'}}>
          <thead><tr>{(kind==='daily'?['Fila','Fecha','Almuerzo / Cena','Comensales','Ingresos','Servidor']:
            ['Fila','Fecha','Categoría','Importe','Base','Servidor']).map(label=>
            <th key={label} style={{padding:8,borderBottom:'1px solid currentColor'}}>{label}</th>)}</tr></thead>
          <tbody>{rows.map((r,i)=><tr key={r.key}>
            <td style={{padding:8}}>{r.line}</td>
            {displayRow(r).map((cell,j)=><td style={{padding:8}} key={j}>{cell}</td>)}
            <td style={{padding:8}}>{preview?.entries?.[i]?
              (STATUS_LABELS[preview.entries[i].status]||'Revisar'):'Sin comprobar'}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div style={{display:'flex',gap:12,flexWrap:'wrap',marginTop:12}}>
        <button type="button" className="primary-button" onClick={check} disabled={busy}>
          {busy?'Validando…':'2. Validar en Supabase (sin guardar)'}
        </button>
        <button type="button" className="ghost-button" onClick={reset} disabled={busy}>Descartar archivo</button>
      </div>
    </div>}
    {preview&&<div className="dashboard-panel">
      <h3>3. Confirmación de importación</h3>
      <p><strong>{preview.ready_count} de {preview.row_count}</strong> filas listas.
        {ready?' No hay conflictos detectados.':' Hay conflictos que bloquean el lote completo.'}</p>
      {ready&&<label style={{display:'flex',gap:8,alignItems:'start'}}>
        <input type="checkbox" checked={understood} disabled={busy} onChange={e=>setUnderstood(e.target.checked)}/>
        Confirmo que los datos son totales reales, no facturas duplicadas; he revisado bases IGIC y fechas.
      </label>}
      <button type="button" className="primary-button" disabled={!ready||!understood||busy} onClick={apply}>
        {busy?'Importando…':'Importar lote completo'}
      </button>
      <p>Si alguien crea una entrada después de la vista previa, la importación se bloqueará sin sobrescribir registros.</p>
    </div>}
  </div>
}
