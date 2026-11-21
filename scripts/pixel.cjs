const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {spawn}=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 fs.mkdirSync(path.join(root,'output'),{recursive:true});
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 const page=await browser.newPage({viewport:{width:960,height:600},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(path.join(root,'index.html')).href+'?capture');
 await page.waitForFunction(()=>window.pixelHideaway);
 for(const time of [0,3,6,12]){
  const png=await page.evaluate(t=>{window.pixelHideaway.draw(t);return window.pixelHideaway.canvas.toDataURL('image/png').split(',')[1]},time);
  fs.writeFileSync(path.join(root,'output','pixel-frame-'+time+'.png'),Buffer.from(png,'base64'));
 }
 await page.getByRole('button').click();
 const sound=await page.getByRole('button').getAttribute('aria-pressed');
 if(sound!=='true')throw Error('Sound did not start');
 await page.getByRole('button').click();
 if(await page.getByRole('button').getAttribute('aria-pressed')!=='false')throw Error('Sound did not stop');
 await page.setViewportSize({width:320,height:220});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 if(overflow)throw Error('Narrow viewport overflows');
 if(errors.length)throw Error(errors.join('\n'));
 console.log('Preview: scene, audio toggle, and narrow layout passed');
 if(process.argv.includes('--preview')){await browser.close();return;}
 const out=path.join(root,'output','pixel-hideaway.gif');
 const enc=spawn('ffmpeg',['-y','-hide_banner','-loglevel','error','-f','image2pipe','-vcodec','png','-framerate','10','-i','pipe:0','-filter_complex','split[a][b];[a]palettegen=max_colors=128:stats_mode=full[p];[b][p]paletteuse=dither=none','-loop','0',out],{stdio:['pipe','ignore','inherit']});
 const finished=new Promise((resolve,reject)=>{enc.on('close',code=>code===0?resolve():reject(Error('GIF encoder exited '+code)));enc.on('error',reject)});
 let failure;enc.stdin.on('error',e=>failure=e);
 for(let i=0;i<120;i++){
  if(failure)throw failure;
  const png=await page.evaluate(t=>{window.pixelHideaway.draw(t);return window.pixelHideaway.canvas.toDataURL('image/png').split(',')[1]},i/10);
  if(!enc.stdin.write(Buffer.from(png,'base64')))await new Promise(resolve=>enc.stdin.once('drain',resolve));
 }
 enc.stdin.end();await finished;await browser.close();
 console.log('Saved '+out+' ('+(fs.statSync(out).size/1024/1024).toFixed(2)+' MiB)');
})().catch(e=>{console.error(e);process.exit(1)});
