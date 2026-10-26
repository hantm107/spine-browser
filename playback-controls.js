// One control surface across all runtime generations.
window.attachPlaybackControls = function(player, project, preferences, save, status) {
  const host = document.getElementById('playbackControls');
  host.replaceChildren(); host.hidden = false;
  const track = () => player.animationState.getCurrent?.(0) || player.animationState.getTrack?.(0);
  const clock = entry => 'trackTime' in entry ? 'trackTime' : 'time';
  const currentTime = () => { const entry=track(); return entry ? entry[clock(entry)] || 0 : 0; };
  const duration = () => track()?.animation.duration || 0;
  const position = () => loop && duration()>0 ? currentTime()%duration() : currentTime();
  let loop = preferences.loop !== false, frameId;
  const button = (label, action, parent=host) => { const b=document.createElement('button'); b.textContent=label;b.type='button';b.onclick=action;parent.append(b);return b; };
  const animations = document.createElement('div'); animations.className='animation-buttons'; animations.setAttribute('aria-label','Animations'); host.append(animations);
  const buttons = new Map();
  function seek(time) {
    const entry=track(); if(!entry)return;
    const target=Math.max(0,Math.min(duration(),time));
    const name=entry.animation.name;
    player.animationState.clearTracks();
    player.animationState.setAnimation(0,name,loop);
    const fresh=track();fresh[clock(fresh)]=target;
    player.skeleton.setToSetupPose();player.animationState.apply(player.skeleton);player.skeleton.updateWorldTransform(2);
    if ('playTime' in player) player.playTime=target;
  }
  function choose(name, remember=true) {
    if(player.config) player.config.animation=name;
    player.setAnimation(name,true);track().loop=loop;player.paused=false;
    for(const [key,b]of buttons){b.classList.toggle('active',key===name);b.setAttribute('aria-pressed',String(key===name));}
    status(name);
    if(remember){preferences.animations ||= {};preferences.animations[project.id]=name;save();}
  }
  for(const animation of player.skeleton.data.animations) buttons.set(animation.name,button(animation.name,()=>choose(animation.name),animations));
  const transport=document.createElement('div');transport.className='transport';host.append(transport);
  const pause=button('Pause',()=>{player.paused=!player.paused;},transport);pause.id='playPauseBtn';
  button('Restart',()=>{seek(0);player.paused=false;},transport).id='restartBtn';
  const fps = Number(player.skeleton.data.fps) || 30;
  button('−1 frame',()=>{player.paused=true;seek(position()-1/fps);},transport).id='previousFrameBtn';
  button('+1 frame',()=>{player.paused=true;seek(position()+1/fps);},transport).id='nextFrameBtn';
  const mode=document.createElement('select');mode.id='loopMode';mode.setAttribute('aria-label','Playback mode');
  for(const [value,label]of [['loop','Loop'],['once','Play once']]){const o=new Option(label,value);mode.add(o);}mode.value=loop?'loop':'once';
  mode.onchange=()=>{loop=mode.value==='loop';if(track())track().loop=loop;preferences.loop=loop;save();};transport.append(mode);
  const speedLabel=document.createElement('label');speedLabel.textContent='Speed: ';
  const speed=document.createElement('select');speed.id='playbackSpeed';speed.setAttribute('aria-label','Playback speed');
  for(const n of [0.25,0.5,1,1.5,2])speed.add(new Option(`${n}×`,String(n)));
  player.speed=[0.25,0.5,1,1.5,2].includes(preferences.speed)?preferences.speed:1;speed.value=String(player.speed);
  speed.onchange=()=>{player.speed=Number(speed.value);preferences.speed=player.speed;save();};speedLabel.append(speed);transport.append(speedLabel);
  const timeline=document.createElement('input');timeline.type='range';timeline.id='timeline';timeline.min=0;timeline.max=duration();timeline.step='0.001';timeline.setAttribute('aria-label','Animation timeline');
  timeline.oninput=()=>{player.paused=true;seek(Number(timeline.value));};host.append(timeline);
  const time=document.createElement('output');time.id='playbackTime';host.append(time);
  const canvas=player.canvas;
  let scrub=null, suppressClick=false;
  function pointerDown(event) {
    if(event.button!==0 || !event.isPrimary || !duration())return;
    suppressClick=false;
    scrub={id:event.pointerId,x:event.clientX,time:position(),width:canvas.getBoundingClientRect().width,dragging:false};
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  }
  function pointerMove(event) {
    if(!scrub || event.pointerId!==scrub.id)return;
    const distance=event.clientX-scrub.x;
    if(!scrub.dragging && Math.abs(distance)<4)return;
    scrub.dragging=true;suppressClick=true;player.paused=true;
    canvas.classList.add('scrubbing');
    seek(scrub.time+distance/Math.max(1,scrub.width)*duration());
  }
  function pointerEnd(event) {
    if(!scrub || event.pointerId!==scrub.id)return;
    if(event.type==='pointerup')pointerMove(event);
    scrub=null;canvas.classList.remove('scrubbing');
    if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
  }
  function previewClick(event) {
    if(event.button!==0)return;
    if(suppressClick){suppressClick=false;event.stopImmediatePropagation();return;}
    if(!player.disposed)player.paused=!player.paused;
  }
  const previewEvents={pointerdown:pointerDown,pointermove:pointerMove,pointerup:pointerEnd,pointercancel:pointerEnd,lostpointercapture:pointerEnd,click:previewClick};
  if(canvas)for(const [name,handler]of Object.entries(previewEvents))canvas.addEventListener(name,handler,true);
  const capture=button('Update thumbnail',()=>window.captureSelectedThumbnail?.());capture.id='captureThumbnailBtn';
  const remembered=preferences.animations?.[project.id];if(buttons.has(remembered))choose(remembered,false);
  else if(track()){track().loop=loop;const b=buttons.get(track().animation.name);b?.classList.add('active');b?.setAttribute('aria-pressed','true');}
  function update(){
    if(player.disposed)return;
    const length=duration(), elapsed=currentTime();
    if(!loop && length>0 && elapsed>=length && !player.paused){player.paused=true;seek(length);}
    timeline.max=String(length);timeline.value=String(loop&&length>0?elapsed%length:Math.min(elapsed,length));timeline.disabled=!length;
    time.textContent=`${Number(timeline.value).toFixed(2)} / ${length.toFixed(2)} s · ${fps} fps`;
    pause.textContent=player.paused?'Play':'Pause';
    frameId=requestAnimationFrame(update);
  }
  update();
  return { dispose(){
    cancelAnimationFrame(frameId);
    if(canvas){
      for(const [name,handler]of Object.entries(previewEvents))canvas.removeEventListener(name,handler,true);
      if(scrub && canvas.hasPointerCapture(scrub.id))canvas.releasePointerCapture(scrub.id);
      canvas.classList.remove('scrubbing');scrub=null;
    }
    host.replaceChildren();host.hidden=true;
  }, seek, choose, currentTime };
};
