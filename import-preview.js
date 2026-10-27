(function(){
  window.createImportPreview = function(host, status) {
    let player=null, runtime=null, request=0, fittedFrame=null, animationFrame=null, targetFrame=null, autoFit=true, lastFitTime=0, scrub=null, suppressClick=false;
    const track=()=>player?.animationState?.getCurrent?.(0)||player?.animationState?.getTrack?.(0);
    const duration=()=>track()?.animation.duration||0;
    const position=()=>{const entry=track();return duration()?(entry?.trackTime??entry?.time??0)%duration():0;};
    function visibleBounds(skeleton){
      const offset=new runtime.Vector2(),size=new runtime.Vector2(),hidden=[];
      for(const slot of skeleton.slots)if(slot.attachment&&((slot.color?.a??slot.a??1)<=0.001||(slot.attachment.color?.a??slot.attachment.a??1)<=0.001||slot.bone.active===false)){hidden.push([slot,slot.attachment]);slot.attachment=null;}
      try{skeleton.getBounds(offset,size,[]);}finally{for(const [slot,attachment]of hidden)slot.attachment=attachment;}
      return Number.isFinite(offset.x)&&Number.isFinite(offset.y)&&Number.isFinite(size.x)&&Number.isFinite(size.y)&&size.x>0&&size.y>0?{x:offset.x,y:offset.y,width:size.x,height:size.y}:null;
    }
    function applyFrame(frame){
      fittedFrame=frame;
      if(player.config){player.currentViewport={...frame,padLeft:frame.width*.06,padRight:frame.width*.06,padTop:frame.height*.06,padBottom:frame.height*.06};player.previousViewport=player.currentViewport;}
      else player.bounds={x:frame.x+frame.width/2,y:frame.y+frame.height/2,width:frame.width*1.12,height:frame.height*1.12};
    }
    function updateFrame(force=false){
      if(!autoFit||!player?.skeleton||!runtime)return;
      const now=performance.now();
      if(force||now-lastFitTime>65){
        lastFitTime=now;const measured=visibleBounds(player.skeleton);
        if(measured){
          const width=Math.max(measured.width,animationFrame?.width*.05||1),height=Math.max(measured.height,animationFrame?.height*.05||1);
          targetFrame={x:measured.x+(measured.width-width)/2,y:measured.y+(measured.height-height)/2,width,height};
        }
      }
      if(!targetFrame)return;
      // Expand immediately to keep new effects in view; ease into smaller poses.
      const amount=force||!fittedFrame||targetFrame.width>fittedFrame.width||targetFrame.height>fittedFrame.height?1:.18;
      applyFrame(Object.fromEntries(Object.entries(targetFrame).map(([key,value])=>[key,(fittedFrame?.[key]??value)+(value-(fittedFrame?.[key]??value))*amount])));
    }
    // Measure a separate skeleton so fitting never changes playback, deformation,
    // or the selected skin. Invisible effect attachments must not shrink the rig.
    function fit(){
      if(!player?.skeleton||!runtime)return;
      const skeleton=new runtime.Skeleton(player.skeleton.data);
      if(player.skeleton.skin)skeleton.setSkin(player.skeleton.skin);
      skeleton.setToSetupPose();
      const animation=track()?.animation,state=new runtime.AnimationState(new runtime.AnimationStateData(skeleton.data));
      if(animation)state.setAnimation(0,animation.name,true);
      const samples=animation?.duration?90:1;
      let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
      for(let i=0;i<samples;i++){
        const delta=i?animation.duration/samples:0;state.update(delta);state.apply(skeleton);skeleton.update?.(delta);skeleton.updateWorldTransform(2);
        const bounds=visibleBounds(skeleton);
        if(bounds){minX=Math.min(minX,bounds.x);minY=Math.min(minY,bounds.y);maxX=Math.max(maxX,bounds.x+bounds.width);maxY=Math.max(maxY,bounds.y+bounds.height);}
      }
      if(!Number.isFinite(minX))return;
      animationFrame={x:minX,y:minY,width:Math.max(1,maxX-minX),height:Math.max(1,maxY-minY)};targetFrame=null;
      if(player.config){
        const viewport=player.config.viewport;viewport.animations ||= {};
        if(animation)viewport.animations[animation.name]={...animationFrame,padLeft:'6%',padRight:'6%',padTop:'6%',padBottom:'6%'};
      }
      applyFrame(animationFrame);player.animationState.apply(player.skeleton);player.skeleton.updateWorldTransform(2);updateFrame(true);
    }
    function seek(time){
      const entry=track();if(!entry)return;
      const target=Math.max(0,Math.min(entry.animation.duration,time)), name=entry.animation.name;
      player.paused=true;player.animationState.clearTracks();player.animationState.setAnimation(0,name,true);
      const fresh=track();fresh['trackTime' in fresh?'trackTime':'time']=target;
      player.skeleton.setToSetupPose();player.animationState.apply(player.skeleton);player.skeleton.updateWorldTransform(2);
      if('playTime'in player)player.playTime=target;
      updateFrame(true);
    }
    function dispose(){request++;scrub=null;suppressClick=false;host.classList.remove('scrubbing');try{player?.dispose();}catch{}player=null;runtime=null;fittedFrame=null;animationFrame=null;targetFrame=null;host.replaceChildren();}
    host.title='Click to pause or resume. Drag left or right to scrub the animation.';
    host.addEventListener('pointerdown',event=>{
      if(event.button!==0||event.isPrimary===false||!event.target.closest('canvas')||!track())return;
      suppressClick=false;scrub={id:event.pointerId,x:event.clientX,time:position(),width:host.clientWidth,dragging:false};
      try{host.setPointerCapture(event.pointerId);}catch{}event.preventDefault();
    },true);
    function pointerMove(event){
      if(!scrub||event.pointerId!==scrub.id)return;
      const distance=event.clientX-scrub.x;if(!scrub.dragging&&Math.abs(distance)<4)return;
      scrub.dragging=true;suppressClick=true;host.classList.add('scrubbing');seek(scrub.time+distance/Math.max(1,scrub.width)*duration());
    }
    host.addEventListener('pointermove',pointerMove,true);
    for(const type of ['pointerup','pointercancel','lostpointercapture'])host.addEventListener(type,event=>{
      if(!scrub||event.pointerId!==scrub.id)return;
      if(type==='pointerup')pointerMove(event);scrub=null;host.classList.remove('scrubbing');if(host.hasPointerCapture(event.pointerId))host.releasePointerCapture(event.pointerId);
    },true);
    host.addEventListener('click',event=>{
      if(event.button!==0||!player)return;
      event.stopImmediatePropagation();if(suppressClick){suppressClick=false;return;}player.paused=!player.paused;
    },true);
    async function show(assets, animation, skin) {
      dispose();const token=request, current=()=>request===token;
      status.textContent='Loading preview…';
      try {
        const api=window.spineApi, version=await api.detectSpineVersion(assets.skeletonPath);
        if(version.mismatch)throw Error(`Preview runtime unavailable for Spine ${version.fileVersion}.`);
        const loadedRuntime=await window.SpineRuntimeLoader.load(version.series);
        const [atlasText,json,skeletonURI,atlasUrl,skeletonUrl,atlasURI]=await Promise.all([api.readTextFile(assets.atlasPath),api.readTextFile(assets.skeletonPath).then(JSON.parse),api.readDataUri(assets.skeletonPath),api.fileUrlForPath(assets.atlasPath),api.fileUrlForPath(assets.skeletonPath),api.readDataUri(assets.atlasPath)]);
        const atlas=new window.SpineRuntimeLoader.atlasRuntime.TextureAtlas(atlasText), textures={}, rawDataURIs={[skeletonUrl]:skeletonURI,[atlasUrl]:atlasURI};
        await Promise.all(atlas.pages.map(async page=>{
          const file=await api.resolveRelativeResource(assets.atlasPath,page.name),url=await api.fileUrlForPath(file),uri=await api.readDataUri(file);
          textures[page.name]=uri;rawDataURIs[url]=uri;rawDataURIs[atlasUrl.slice(0,atlasUrl.lastIndexOf('/')+1)+page.name]=uri;
        }));
        if(!current())return;
        runtime=loadedRuntime;
        window.SpineBlendCompatibility.configure(runtime,textures,atlas.pages);
        const names=Object.keys(json.animations||{}), chosen=names.includes(animation)?animation:names[0];
        const success=p=>{if(!current()){p.dispose();return;}player=p;if(skin){p.skeleton.setSkinByName(skin);p.skeleton.setSlotsToSetupPose();}if(chosen){p.setAnimation(chosen,true);p.paused=false;p.play?.();}fit();status.textContent=`Spine ${version.fileVersion}${chosen?' · '+chosen:''}`;};
        const error=(_p,message)=>{if(current())status.textContent='Preview failed: '+message;};
        if(version.kind==='legacy') {
          player=new window.LegacySpinePlayer(host,{runtime,series:version.series,atlasText,textures,skeletonDataURI:skeletonURI,isJson:true,json,premultipliedAlpha:true,chooseAnimation:()=>chosen,success,error});
          await player.ready;
        } else {
          await new Promise((resolve,reject)=>{
            player=new runtime.SpinePlayer(host,{jsonUrl:skeletonUrl,skeleton:skeletonUrl,atlasUrl,atlas:atlasUrl,rawDataURIs,animation:chosen,skin:skin||undefined,showControls:false,showLoading:false,alpha:false,backgroundColor:'#0b1120',premultipliedAlpha:true,success:p=>{success(p);resolve();},error:(p,message)=>{error(p,message);reject(Error(message));}});
          });
        }
      }catch(error){if(current())status.textContent=error.message;throw error;}
    }
    return {show,dispose,seek,fit(){autoFit=false;fit();},autoFit(enabled){autoFit=enabled;updateFrame(true);},updateFrame,duration,skin(name){if(player?.skeleton){player.skeleton.setSkinByName(name);player.skeleton.setSlotsToSetupPose();player.skeleton.updateCache?.();if(player.config)player.config.skin=name;player.animationState.apply(player.skeleton);player.skeleton.updateWorldTransform(2);fit();}},inspect(){const entry=track();return player&&{version:player.skeleton?.data.version,animation:entry?.animation?.name,time:entry?.trackTime??entry?.time,paused:player.paused,bones:player.skeleton?.bones.length,frame:fittedFrame,animationFrame,autoFit};},choose(name){if(player?.skeleton&&name){player.setAnimation(name,true);fit();player.paused=false;player.play?.();status.textContent=`Spine ${player.skeleton.data.version} · ${name}`;}},toggle(){if(player)player.paused=!player.paused;}};
  };
})();
