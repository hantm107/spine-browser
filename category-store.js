(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CategoryStore=api;})(typeof window==='undefined'?globalThis:window,()=>{
  const COLORS=['#f87171','#fb923c','#facc15','#4ade80','#22d3ee','#60a5fa','#a78bfa','#f472b6'];
  function nextColor(categories){
    const used=new Set(categories.map(c=>c.color.toLowerCase()));
    const preset=COLORS.find(color=>!used.has(color));if(preset)return preset;
    // Spread hues with a golden-angle sequence; compare actual RGB values so
    // rounding never assigns the same rendered color to two categories.
    for(let i=categories.length;;i++){
      const hue=(i*137.50776405)%360,saturation=(70+(i%3)*5)/100,lightness=(58+(Math.floor(i/3)%3)*6)/100;
      const a=saturation*Math.min(lightness,1-lightness);
      const channel=n=>{const k=(n+hue/30)%12;return Math.round(255*(lightness-a*Math.max(-1,Math.min(k-3,9-k,1)))).toString(16).padStart(2,'0');};
      const color='#'+channel(0)+channel(8)+channel(4);if(!used.has(color))return color;
    }
  }
  function nameFor(categories,name,except){
    name=String(name||'').trim();
    if(!name)throw Error('Enter a category name.');
    if(name.length>40)throw Error('Use 40 characters or fewer.');
    if(['all assets','favorites','append list'].includes(name.toLowerCase()) || categories.some(c=>c.id!==except&&c.name.toLowerCase()===name.toLowerCase()))throw Error('Choose a unique category name.');
    return name;
  }
  function create(categories,name,id){
    const category={id,name:nameFor(categories,name),color:nextColor(categories),assets:{}};
    categories.push(category);return category;
  }
  function rename(categories,id,name){const category=categories.find(c=>c.id===id);if(!category)throw Error('Category not found.');category.name=nameFor(categories,name,id);}
  function remove(categories,id){return categories.filter(c=>c.id!==id);}
  function assign(categories,id,project,enabled){const category=categories.find(c=>c.id===id);if(!category)throw Error('Category not found.');if(enabled)category.assets[project.id]={...project};else delete category.assets[project.id];}
  return {COLORS,create,rename,remove,assign};
});
