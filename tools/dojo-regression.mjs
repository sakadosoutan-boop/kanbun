import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'.test-output/dojo'); fs.mkdirSync(out,{recursive:true});
const url=pathToFileURL(path.join(root,process.env.KANBUN_ENTRY||'index.html')).href;
const browser=await chromium.launch({channel:process.env.PW_CHANNEL||undefined});
const errors=[];
try {
  const page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'});
  page.on('pageerror',e=>errors.push(e.message));
  async function loadLegacySnapshot() {
    const saved=await page.evaluate(()=>JSON.stringify(Store.state));
    // 先にホームへ移り、旧データ注入後に現行ゲームのpagehide保存が上書きしないようにする。
    await page.goto(url);
    await page.evaluate(raw=>localStorage.setItem('kanbun-dojo:v1',raw),saved);
    await page.reload();await page.locator('[data-act="resume"]').click();
  }
  await page.goto(url);
  const seed=await page.evaluate(()=>{
    const s={xp:9500,answered:1234,correct:987,streak:9,lastDay:'2026-9-16',bestDay:18,
      best:{mogi:95,battle:8765},plays:{mogi:6,battle:8},days:{'2026-9-16':[20,18,250]},chars:9876,secs:3210,
      srs:{'kt05:ex':{w:3,r:4,t:10000}},ach:['a1','a2','a3','a4','a5','a6','a7','a8','a9','a10','a11','a12'],
      foesCleared:Array.from({length:8},(_,i)=>'f'+(i+1)),theme:'dark',vertical:true,_perfect:true,_maxCombo:12};
    localStorage.setItem('kanbun-dojo:v1',JSON.stringify(s));return s;
  });
  await page.reload();
  const state=await page.evaluate(()=>Store.state);
  for(const [k,v] of Object.entries(seed))assert.deepEqual(state[k],v,'old record '+k);
  await page.locator('[data-act="journey"]').click();
  assert.equal(await page.locator('[data-act="lore"]').count(),8);
  assert.equal(await page.locator('[data-act="lore"][data-id="f9"]').count(),0);
  await page.locator('[data-act="lore"][data-id="f7"]').click();
  for(const s of ['由来・人物','原文','書き下し','現代語訳','読みどころ','静夜思'])assert.ok((await page.locator('#app').innerText()).includes(s));
  assert.ok((await page.locator('#app').innerText()).includes('牀前明月光'));
  await page.screenshot({path:path.join(out,'libai-unlocked.png'),fullPage:true});
  await page.locator('[data-act="journey"]').click();
  await page.locator('[data-act="stage"][data-i="8"]').click();
  await page.locator('[data-act="foego"]').click();
  assert.equal(await page.evaluate(()=>__peek().ki),12);
  const deck=await page.evaluate(()=>__peek().qs.map(q=>({key:q.key,passage:QuizGen.passageKey(q)})));
  for(let i=1;i<deck.length;i++)assert.notEqual(deck[i].passage,deck[i-1].passage);
  for(let i=0;i<12;i++){
    const a=await page.evaluate(()=>__peek().qs[__peek().i].a);
    await page.locator('[data-act="ans"][data-i="'+a+'"]').click();
    await page.locator('[data-act="next"]').click();
  }
  assert.equal(await page.locator('.gate-clear').count(),1);
  await page.locator('.lore-unlocked summary').click();
  assert.ok((await page.locator('.foe-lore').innerText()).includes('原料の植物'));
  const score=await page.evaluate(()=>__peek().score);
  // 公開済み旧版の突破画面には foe.lore / questionRevision が含まれない。
  await page.evaluate(()=>{delete Store.state.session.foe.lore;delete Store.state.session.questionRevision;Store.save();});
  await loadLegacySnapshot();
  assert.equal(await page.evaluate(()=>__peek().score),score);
  await page.locator('.lore-unlocked summary').click();
  await page.screenshot({path:path.join(out,'xunzi-clear-lore.png'),fullPage:true});
  await page.locator('[data-act="bend"]').click();
  await page.locator('[data-act="go"][data-to="home"]').first().click();
  await page.locator('[data-act="journey"]').click();
  assert.equal(await page.locator('[data-act="lore"][data-id="f9"]').count(),1);
  await page.locator('[data-act="stage"][data-i="6"]').click();await page.locator('[data-act="foego"]').click();
  await page.evaluate(()=>{
    const s=Store.state.session;
    delete s.questionRevision;delete s.foe.lore;s.foe.cats=['漢詩','比較','選択'];
    s.qs=[QuizGen.build('kuho').find(q=>q.cat==='比較')];s.i=0;
    s.score=123;s.ki=4;s.kiMax=5;s.hearts=2;Store.save();
  });
  const before=await page.evaluate(()=>Store.state.answered);
  await loadLegacySnapshot();
  assert.ok(await page.evaluate(()=>__peek().qs.every(q=>q.cat==='漢詩')));
  assert.deepEqual(await page.evaluate(()=>[__peek().score,__peek().ki,__peek().kiMax,__peek().hearts,Store.state.answered]),[123,4,5,2,before]);
  // 文字ごとに立てた英字。横書きへ戻しても文字順を保つ。
  await page.evaluate(()=>__renderStem('命ABC'));
  const latin=page.locator('.q-stem .latin-upright');
  assert.equal((await latin.allTextContents()).join(''),'ABC');
  assert.ok(await latin.evaluateAll(els=>els.every(el=>getComputedStyle(el).textOrientation==='upright')));
  await page.screenshot({path:path.join(out,'latin-vertical.png')});
  await page.locator('[data-act="tate"]').click();await page.evaluate(()=>__renderStem('命ABC'));
  assert.ok(await page.locator('.q-stem').evaluate(el=>getComputedStyle(el).writingMode==='horizontal-tb'));
  // 四つの指摘された問題を実際の問題画面に出して、選択肢と採点を確認。
  for(const key of ['si04:read','ru02:mean','j9-3','kt05:ex']) {
    await page.goto(url);
    await page.evaluate(()=>{Store.state.vertical=true;Store.state.timedPractice=false;Store.save();});
    await page.reload();
    await page.locator('[data-act="play"][data-id="kuho"]').click();
    await page.evaluate(key=>{const g=__peek();g.qs=[g.qs[0],QuizGen.build('mogi').find(q=>q.key===key)];},key);
    let a=await page.evaluate(()=>__peek().qs[0].a);
    await page.locator('[data-act="ans"][data-i="'+a+'"]').click();await page.locator('[data-act="next"]').click();
    await page.screenshot({path:path.join(out,key.replace(':','-')+'.png'),fullPage:true});
    a=await page.evaluate(()=>__peek().qs[1].a);
    await page.locator('[data-act="ans"][data-i="'+a+'"]').click();
    assert.equal(await page.locator('.choice.correct').count(),1);
  }
  // 全員の解放済み画面を320px/390pxでも検証。これは隔離したテスト記録。
  await page.evaluate(()=>{Store.state.foesCleared=FOES.map(f=>f.id);Store.state.session=null;Store.save();});
  await page.reload();await page.locator('[data-act="journey"]').click();
  await page.screenshot({path:path.join(out,'portraits-desktop.png'),fullPage:true});
  for(const width of [390,320]) {
    await page.setViewportSize({width,height:844});
    for(const id of ['f7','f9','f10','f11','f12','f13','f14','f15','f16']) {
      await page.locator('[data-act="lore"][data-id="'+id+'"]').click();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),id+' overflow at '+width);
      if(width===390&&id==='f12')await page.screenshot({path:path.join(out,'zhuangzi-mobile.png'),fullPage:true});
      await page.locator('[data-act="journey"]').click();
    }
    await page.locator('[data-act="stage"][data-i="15"]').click();await page.locator('[data-act="foego"]').click();
    assert.equal(await page.evaluate(()=>__peek().kiMax),20);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'HP20 overflow');
    await page.screenshot({path:path.join(out,'hp20-'+width+'.png'),fullPage:true});
    await page.goto(url);await page.locator('[data-act="journey"]').click();
  }
  assert.deepEqual(errors,[]);
  console.log('✔ 旧記録18項目・既クリア解説解放・新クリアと再開・英字正立・指摘4問・人物画・320/390px');
} finally {await browser.close();}
