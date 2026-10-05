// Curated "Đi trong ngày" destinations, keyed by Wikidata QID.
// Tag-based rules failed (2026-10-02): "zone ≥ 4 + castle" caught ~500 private manors, while OSM tags the
// Château de Versailles only as tourism=attraction/museum. Being a day trip is an editorial choice, so it is a list.
// QIDs were read from the imported OSM data, not typed from memory. Add new ones the same way:
//   SELECT name, wikidata, navigo_zone FROM pois WHERE name ILIKE '%…%' AND wikidata IS NOT NULL;
export const DAY_TRIP_WIKIDATA: Record<string, string> = {
  Q2946: 'Château de Versailles',
  Q201428: 'Château de Fontainebleau',
  Q739976: 'Château de Vaux-le-Vicomte',
  Q2313567: 'Parc Disneyland',
  Q764906: 'Disney Adventure World',
  Q1520841: 'Château de Saint-Germain-en-Laye',
  Q648534: 'Château de Rambouillet',
  Q684846: 'Domaine national de la Malmaison',
  Q3533057: 'Tour César (Provins)',
  Q1543065: 'Grange aux Dîmes (Provins)',
  Q22916031: 'Auberge Ravoux – maison de Van Gogh (Auvers-sur-Oise)',
  Q161787: 'Château de Champs-sur-Marne',
  Q2968669: 'Château de Breteuil',
  Q2321914: 'Château de Courances',
  Q2970796: 'Château de Thoiry',
  Q1011058: 'Château de Blandy-les-Tours',
  Q1547865: 'Château de Dampierre',
  Q1190649: 'Château de Monte-Cristo',
  Q627915: 'France Miniature',
  Q940746: 'Villa Savoye',
}
