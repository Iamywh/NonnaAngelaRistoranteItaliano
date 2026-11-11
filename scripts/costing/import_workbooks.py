"""Read-only import: python scripts/costing/import_workbooks.py RAW.xlsx FULL.xlsx.

Produces a private SQL seed; never changes public menu prices. Requires openpyxl.
Mappings are explicit; differing recipes require administrator confirmation.
"""
import json
import sys
import glob
from pathlib import Path
import openpyxl

raw_path, full_path = map(Path, sys.argv[1:])
raw, full = [openpyxl.load_workbook(p, data_only=True, read_only=True) for p in (raw_path, full_path)]
keys = [
    'insalata_rucola_grana','insalata_mista','tagliere_affettati:medio','tagliere_affettati:entero',
    'tagliere_formaggi:medio','tagliere_formaggi:entero','carpaccio_bresaola','caprese',
    'burrata_anchoas_tomate_seco','bruschetta_lardo_colonnata_taleggio','crostone_salsiccia_taleggio',
    'melanzane_alla_parmigiana','mozzarella_carrozza_anchoas',None,'lasagne_bolognese',
    'gnocchi_pesto_gambas_tomate_pistacho',None,'spaghetti_cacio_e_pepe','paccheri_amatriciana',
    'paccheri_carbonara','spaghetti_pomodoro_basilico','arrosticini_abruzzesi','lingote_cerdo',
    'tagliata_ternera_rucula_grana_pachino','papas_al_horno','verduras_a_la_parrilla',None,
    'tiramisu_classico','baba_al_ron','cannolo_alla_siciliana','tarta_manzana_canela_albaricoque'
]
review = {10:'Stracchino nel file, taleggio in carta',15:'Verificare pomodoro e composizione del pesto',
          18:'Rigatoni nel file, paccheri in carta',23:'Ternera nel file, vitello in carta',
          30:'Confermare confettura di albicocca nella ricetta'}
rows = []
for i, (a, b) in enumerate(zip(list(raw['Food cost per piatto'].values)[5:36], list(full['Food cost per piatto'].values)[5:36])):
    assert a[:13] == b[:13], 'Conflicting cost sheets'
    assert isinstance(a[7], (int, float)) and a[7] >= 0
    rows.append(dict(id=f'excel-{i+6}', menu_key=keys[i], approved=keys[i] is not None and i not in review,
        name=a[1], variant=a[2], source_price=a[3], raw_cost=a[7], confidence=a[10], notes=a[12] or '',
        review=review.get(i, ''), source_row=i+6, base_cost=a[4], correction=a[5], market_extra=a[6]))
mapped=set(k for k in keys if k)
for path in glob.glob('data/menu/*.json'):
    menu=json.load(open(path,encoding='utf-8-sig'))
    if not isinstance(menu,list): continue
    for p in menu:
        if 'prezzo_consigliato' not in p: continue
        prices=p['prezzo_consigliato']
        for variant in (prices if isinstance(prices,dict) else [None]):
            key=p['id']+(':'+variant if variant else '')
            if key not in mapped:
                rows.append(dict(id='menu-'+key,menu_key=key,approved=False,name=p.get('name_it',key),
                    variant=variant,source_price=None,raw_cost=None,confidence='Da completare',
                    notes='Nessuna scheda nel file Excel: inserire il costo della ricetta.',review='',source_row=None))
model = dict(source_files=[raw_path.name,full_path.name], source_sheet='Food cost per piatto',
    source_fixed=dict(zip(['staff','electricity','water','rent','total'],[full['Costi fissi'][f'B{r}'].value for r in range(5,10)])),
    params=dict(fixed_monthly=20000,covers=600,dishes_per_cover=2,kitchen_share=.7,tax_rate=.07,
                raw_target=.25,margin_target=.1,open_days=26,ticket=40), rows=rows,
    sources=[list(r) for r in full['Parametri e fonti'].values],
    verification=[list(r) for r in full['Priorità verifica'].values])
catalog = []
costs = json.load(open('data/costing/ingredientUnitCosts.json',encoding='utf-8-sig'))['unit_costs']
costs = {c['ingredient_id']:c for c in costs}
for source in ['ingredients','beverages','barIngredients']:
    for p in json.load(open('src/data/'+source+'.json',encoding='utf-8-sig')):
        if p.get('active') is False: continue
        c=costs.get(p['id'],{})
        valid=c.get('unit')==p.get('unit') and c.get('supplier')==p.get('supplier')
        catalog.append(dict(id=source+':'+p['id'], name=p.get('name_it',p['id']),
            area='food' if source=='ingredients' else 'beverage',unit=p.get('unit','unit'),
            supplier=p.get('supplier'),quantity=None,minimum=None,
            unit_cost=c.get('unit_cost') if valid else None,cost_source=c.get('source') if valid else None,
            notes=p.get('notes',''),used_in=p.get('used_in',[])))
suppliers=json.load(open('src/data/suppliers.json',encoding='utf-8-sig'))
def literal(value): return "'"+json.dumps(value,ensure_ascii=False,default=str).replace("'","''")+"'::jsonb"
sql='-- Generated read-only from the two 10 November workbooks and existing catalog.\nBEGIN;\n'
sql+='INSERT INTO public.manager_cost_model(id,body) VALUES (true,'+literal(model)+') ON CONFLICT (id) DO NOTHING;\n'
for s in suppliers:
    sql+='INSERT INTO public.procurement_suppliers(id,body) VALUES ('+"'"+s['id']+"',"+literal(s)+') ON CONFLICT (id) DO NOTHING;\n'
for p in catalog:
    sql+='INSERT INTO public.procurement_products(id,body) VALUES ('+"'"+p['id']+"',"+literal(p)+') ON CONFLICT (id) DO NOTHING;\n'
sql+='COMMIT;\n'
Path('supabase/migrations/20261110171000_manager_workbook_seed.sql').write_text(sql)
print(f'Imported {len(rows)} cost records (31 spreadsheet rows) and {len(catalog)} products; public menu unchanged.')
