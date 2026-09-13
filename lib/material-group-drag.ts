import type {Asset} from '@/lib/journal';

type GroupedAsset=Pick<Asset,'id'|'group'>;

export function materialDragIds(draggedId:string,selectedIds:ReadonlySet<string>,availableAssets:GroupedAsset[]):string[]{
 if(!selectedIds.has(draggedId))return [draggedId];
 return availableAssets.filter(asset=>selectedIds.has(asset.id)).map(asset=>asset.id);
}

export function materialGroupPatches(assets:GroupedAsset[],ids:readonly string[],group:string):{id:string;group:string}[]{
 const moving=new Set(ids);
 return assets.filter(asset=>moving.has(asset.id)&&asset.group!==group).map(asset=>({id:asset.id,group}));
}
