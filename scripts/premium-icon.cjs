/* Export adaptive/launcher/splash sizes from the approved generated artwork. */
const sharp=require('sharp');
const path=require('path');
const dir=path.resolve(__dirname,'../assets');
(async()=>{
 const source=path.join(dir,'icon.png');
 const bg={r:10,g:9,b:8,alpha:1};
 await sharp({create:{width:1024,height:1024,channels:4,background:bg}}).png().toFile(path.join(dir,'icon-background.png'));
 // Keep the mark inside Android's adaptive safe area, including circular masks.
 await sharp(source).resize(880,880,{fit:'contain',background:bg}).extend({top:72,bottom:72,left:72,right:72,background:bg}).png().toFile(path.join(dir,'icon-foreground.png'));
 await sharp(source).resize(1024,1024).png().toFile(path.join(dir,'icon-rounded.png'));
 const mark=await sharp(source).resize(720,720).png().toBuffer();
 for(const name of ['splash.png','splash-dark.png']) await sharp({create:{width:2732,height:2732,channels:4,background:bg}}).composite([{input:mark,gravity:'center'}]).png().toFile(path.join(dir,name));
 await sharp(source).resize(96,96).png().toFile(path.resolve(__dirname,'../www/brand-icon.png'));
})().catch(e=>{console.error(e);process.exit(1)});
