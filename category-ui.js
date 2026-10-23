// UI uses the same workspace persistence and absolute-path records as Favorites.
function activeCategory(){return favoritesOnly.checked?'favorites':workspace.categories.find(c=>c.id===workspace.category)?.id || 'all';}
function activeBookmarkMap(){const id=activeCategory();return id==='favorites'?workspace.favorites:workspace.categories.find(c=>c.id===id)?.assets;}
async function selectCategory(id){
  workspace.category=id;favoritesOnly.checked=id==='favorites';
  saveWorkspace();renderCategories();
  if(id!=='all')await refreshFavorites();
  refreshProjectList();saveWorkspace();
}
function renderCategories(){
  const list=document.getElementById('categoryList');list.replaceChildren();
  const rows=[{id:'all',name:'All assets',count:allProjects.length},{id:'favorites',name:'Favorites',count:Object.keys(workspace.favorites).length},...workspace.categories.map(c=>({...c,count:Object.keys(c.assets).length}))];
  for(const category of rows){
    const row=document.createElement('div');row.className='category-row';
    const button=document.createElement('button');button.type='button';button.className='category-choice';button.dataset.category=category.id;button.setAttribute('aria-pressed',String(activeCategory()===category.id));
    if(category.color){const dot=document.createElement('span');dot.className='category-dot';dot.style.backgroundColor=category.color;button.append(dot);}
    const label=document.createElement('span');label.className='category-label';label.textContent=category.name;
    const count=document.createElement('small');count.textContent=String(category.count);button.append(label,count);button.onclick=()=>selectCategory(category.id);row.append(button);
    if(category.color){const edit=document.createElement('button');edit.className='edit-category';edit.textContent='…';edit.setAttribute('aria-label','Edit '+category.name);edit.onclick=()=>editCategory(category);row.append(edit);}
    list.append(row);
  }
  document.getElementById('categoryCount').textContent=String(workspace.categories.length);
  document.getElementById('newCategoryName').title='Each category receives its own color.';
}
function createCategory(name){const category=CategoryStore.create(workspace.categories,name,crypto.randomUUID());saveWorkspace();renderCategories();renderProjectList(filteredProjects());return category;}
function assignCategory(id,project,enabled){CategoryStore.assign(workspace.categories,id,bookmark(project),enabled);saveWorkspace();renderCategories();refreshProjectList();}
function removeCategory(id){workspace.categories=CategoryStore.remove(workspace.categories,id);if(workspace.category===id){workspace.category='all';favoritesOnly.checked=false;}saveWorkspace();renderCategories();refreshProjectList();}
function categoryDialog(title){
  let dialog=document.getElementById('categoryDialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='categoryDialog';document.body.append(dialog);}
  dialog.replaceChildren();const heading=document.createElement('h2');heading.id='categoryDialogTitle';heading.textContent=title;dialog.setAttribute('aria-labelledby',heading.id);dialog.append(heading);
  const content=document.createElement('div');content.className='category-dialog-content';dialog.append(content);
  const close=document.createElement('button');close.className='dialog-close';close.textContent='Close';close.onclick=()=>dialog.close();dialog.append(close);dialog.showModal();return dialog;
}
function editCategory(category){
  const dialog=categoryDialog('Edit category'),content=dialog.querySelector('.category-dialog-content');const form=document.createElement('form');form.className='category-edit-form';
  const input=document.createElement('input');input.value=category.name;input.maxLength=40;input.setAttribute('aria-label','Category name');
  const save=document.createElement('button');save.type='submit';save.textContent='Rename';
  const error=document.createElement('p');error.setAttribute('role','status');
  form.onsubmit=event=>{event.preventDefault();try{CategoryStore.rename(workspace.categories,category.id,input.value);saveWorkspace();renderCategories();renderProjectList(filteredProjects());dialog.close();}catch(e){error.textContent=e.message;}};
  form.append(input,save);content.append(form,error);
  const remove=document.createElement('button');remove.className='delete-category';remove.textContent='Delete category';
  const note=document.createElement('p');note.className='category-hint';note.textContent='Deleting this category removes its tags. Original files and Favorites are kept.';content.append(note,remove);
  let confirmed=false;remove.onclick=()=>{if(!confirmed){confirmed=true;remove.textContent='Confirm delete';return;}removeCategory(category.id);dialog.close();};input.focus();
}
function editAssetCategories(project){
  const dialog=categoryDialog('Categories for '+project.name),content=dialog.querySelector('.category-dialog-content');
  const path=document.createElement('p');path.className='category-hint';path.textContent=project.fullPath;content.append(path);
  if(!workspace.categories.length){const note=document.createElement('p');note.textContent='Create a category in the sidebar first.';content.append(note);return;}
  const buttons=document.createElement('div');buttons.className='category-toggle-list';content.append(buttons);
  for(const category of workspace.categories){
    const button=document.createElement('button');button.type='button';button.className='category-membership';button.dataset.category=category.id;button.style.setProperty('--tag-color',category.color);
    const update=()=>button.setAttribute('aria-pressed',String(!!category.assets[project.id]));update();
    button.onclick=()=>{assignCategory(category.id,project,!category.assets[project.id]);update();};
    const dot=document.createElement('span');dot.className='category-dot';dot.style.backgroundColor=category.color;
    const name=document.createElement('span');name.textContent=category.name;
    button.append(dot,name);buttons.append(button);
  }
  buttons.querySelector('button')?.focus();
}
function assetCategoryTags(project){
  const tags=document.createElement('div');tags.className='asset-category-tags';
  for(const category of workspace.categories.filter(c=>c.assets[project.id])){
    const tag=document.createElement('button');tag.type='button';tag.className='asset-category-tag';tag.textContent=category.name;tag.style.setProperty('--tag-color',category.color);tag.title=category.name;tag.setAttribute('aria-label','Open category '+category.name);tag.onclick=event=>{event.stopPropagation();selectCategory(category.id);};tags.append(tag);
  }
  return tags;
}
function initializeCategories(){
  document.getElementById('newCategoryForm').onsubmit=event=>{event.preventDefault();const input=document.getElementById('newCategoryName'),message=document.getElementById('categoryMessage');try{createCategory(input.value);input.value='';message.textContent='';}catch(error){message.textContent=error.message;}};
  renderCategories();
}
