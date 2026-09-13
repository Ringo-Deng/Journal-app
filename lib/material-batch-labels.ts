export type MaterialLabelDimension='content'|'style'|'color';
export type MaterialLabels=Record<MaterialLabelDimension,string[]>;
export type MaterialLabelChanges=Record<MaterialLabelDimension,ReadonlySet<string>>;

const dimensions:MaterialLabelDimension[]=['content','style','color'];

export function mergeMaterialLabels(current:MaterialLabels,additions:MaterialLabelChanges,removals:MaterialLabelChanges):MaterialLabels{
 return Object.fromEntries(dimensions.map(dim=>{
  const labels=new Set(current[dim]);
  removals[dim].forEach(label=>labels.delete(label));
  additions[dim].forEach(label=>labels.add(label));
  return [dim,[...labels]];
 })) as MaterialLabels;
}
