(function(){
  window.createImportPreview = function(host, status) {
    let player=null, request=0;
    const track=()=>player?.animationState?.getCurrent?.(0)||player?.animationState?.getTrack?.(0);
    function seek(time){
      const entry=track();if(!entry)return;
      const target=Math.max(0,Math.min(entry.animation.duration,time)), name=entry.animation.name;
      player.paused=true;player.animationState.clearTracks();player.animationState.setAnimation(0,name,true);
      const fresh=track();fresh['trackTime' in fresh?'trackTime':'time']=target;
      player.skeleton.setToSetupPose();player.animationState.apply(player.skeleton);player.skeleton.updateWorldTransform(2);
      if('playTime'in player)player.playTime=target;
    }
    function dispose(){request++;try{player?.dispose();}catch{}player=null;host.replaceChildren();}
    async function show(assets, animation, skin) {
      dispose();const token=request, current=()=>request===token;
      status.textContent='Loading preview…';
      try {
        const api=window.spineApi, version=await api.detectSpineVersion(assets.skeletonPath);
        if(version.mismatch)throw Error(`Preview runtime unavailable for Spine ${version.fileVersion}.`);
        const runtime=await window.SpineRuntimeLoader.load(version.series);
        const [atlasText,json,skeletonURI,atlasUrl,skeletonUrl,atlasURI]=await Promise.all([api.readTextFile(assets.atlasPath),api.readTextFile(assets.skeletonPath).then(JSON.parse),api.readDataUri(assets.skeletonPath),api.fileUrlForPath(assets.atlasPath),api.fileUrlForPath(assets.skeletonPath),api.readDataUri(assets.atlasPath)]);
        const atlas=new window.SpineRuntimeLoader.atlasRuntime.TextureAtlas(atlasText), textures={}, rawDataURIs={[skeletonUrl]:skeletonURI,[atlasUrl]:atlasURI};
        await Promise.all(atlas.pages.map(async page=>{
          const file=await api.resolveRelativeResource(assets.atlasPath,page.name),url=await api.fileUrlForPath(file),uri=await api.readDataUri(file);
          textures[page.name]=uri;rawDataURIs[url]=uri;rawDataURIs[atlasUrl.slice(0,atlasUrl.lastIndexOf('/')+1)+page.name]=uri;
        }));
        if(!current())return;
        window.SpineBlendCompatibility.configure(runtime,textures,atlas.pages);
        const names=Object.keys(json.animations||{}), chosen=names.includes(animation)?animation:names[0];
        const success=p=>{if(!current()){p.dispose();return;}if(skin){p.skeleton.setSkinByName(skin);p.skeleton.setSlotsToSetupPose();}if(chosen){p.setAnimation(chosen,true);p.paused=false;p.play?.();}status.textContent=`Spine ${version.fileVersion}${chosen?' · '+chosen:''}`;};
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
    return {show,dispose,seek,duration:()=>track()?.animation.duration||0,skin(name){if(player?.skeleton){player.skeleton.setSkinByName(name);player.skeleton.setSlotsToSetupPose();player.skeleton.updateCache?.();if(player.config)player.config.skin=name;if(track())player.setViewport?.(track().animation);player.fit?.();player.animationState.apply(player.skeleton);player.skeleton.updateWorldTransform(2);}},inspect(){const entry=track();return player&&{version:player.skeleton?.data.version,animation:entry?.animation?.name,time:entry?.trackTime??entry?.time,paused:player.paused,bones:player.skeleton?.bones.length};},choose(name){if(player?.skeleton&&name){player.setAnimation(name,true);player.paused=false;player.play?.();status.textContent=`Spine ${player.skeleton.data.version} · ${name}`;}},toggle(){if(player)player.paused=!player.paused;}};
  };
})();
