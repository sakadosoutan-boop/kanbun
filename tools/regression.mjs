import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '.test-output/regression');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const url = pathToFileURL(path.join(root, process.env.KANBUN_ENTRY || 'index.html')).href;
const errors = [];
const contexts = [];
async function fresh(seed, width=390) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce' }); contexts.push(ctx);
  const p=await ctx.newPage(); p.on('pageerror', e=>errors.push(e.stack));
  await p.goto(url);
  if(seed) { await p.evaluate(seed=>localStorage.setItem('kanbun-dojo:v1',JSON.stringify(seed)),seed); await p.reload(); }
  return p;
}
async function click(p,act,extra='') { await p.locator('[data-act="'+act+'"]'+extra).first().click(); }
async function play(p,id) { await click(p,'play','[data-id="'+id+'"]'); }
async function answer(p,correct=true) {
  const i=await p.evaluate(ok=>{const g=__peek(),a=g.qs[g.i].a;return ok?a:(a+1)%4;},correct);
  await click(p,'ans','[data-i="'+i+'"]');
}
async function noOverflow(p) { assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow'); }
try {
  {
    const p=await fresh();
    assert.equal(await p.evaluate(()=>Store.state.streak),0);
    await p.screenshot({path:path.join(out,'home-mobile.png'),fullPage:true});
    await click(p,'onboard'); await click(p,'intro-demo');
    await click(p,'kt','[data-i="1"]'); await click(p,'kt','[data-i="0"]');
    await click(p,'ktnext'); await play(p,'intro');
    assert.equal(await p.evaluate(()=>__peek().qs.length),3);
    for(let i=0;i<3;i++){await answer(p);await click(p,'next');}
    assert.equal(await p.evaluate(()=>Store.state.onboarding),true);
    assert.equal(await p.evaluate(()=>Store.state.session),null);
    console.log('✔ 入門：見本 → タップ → 自力3問');
  }
  {
    const p=await fresh(); await play(p,'kuho');
    await click(p,'quit');
    const before=await p.evaluate(()=>Store.state.answered);
    await p.keyboard.press('1'); assert.equal(await p.evaluate(()=>Store.state.answered),before);
    await p.keyboard.press('Shift+Tab'); assert.equal(await p.locator('.ovl [data-x="o"]').evaluate(el=>el===document.activeElement),true);
    await p.locator('.ovl [data-x="c"]').click();
    let left=await p.evaluate(()=>__peek().left); await p.waitForTimeout(350);
    assert.ok(await p.evaluate(()=>__peek().left)<left);
    await click(p,'quit'); await p.keyboard.press('Escape');
    left=await p.evaluate(()=>__peek().left); await p.waitForTimeout(250);
    assert.ok(await p.evaluate(()=>__peek().left)<left);
    await click(p,'quit'); await p.locator('.ovl').click({position:{x:2,y:2}});
    left=await p.evaluate(()=>__peek().left); await p.waitForTimeout(250);
    assert.ok(await p.evaluate(()=>__peek().left)<left);
    await answer(p,false);
    assert.ok(await p.locator('.feedback-reason').textContent());
    assert.equal(await p.evaluate(()=>document.activeElement.getAttribute('data-act')),'next');
    const saved=await p.evaluate(()=>({answered:Store.state.answered,score:__peek().score,key:__peek().qs[0].key}));
    await p.reload();
    assert.equal(await p.evaluate(()=>Store.state.answered),saved.answered);
    await click(p,'resume');
    assert.equal(await p.evaluate(()=>__peek().locked),true);
    assert.equal(await p.evaluate(()=>Store.state.answered),saved.answered);
    assert.equal(await p.evaluate(()=>__peek().score),saved.score);
    await click(p,'learn'); assert.equal(await p.locator('.lesson-body').count(),1);
    await click(p,'go','[data-to="home"]'); await click(p,'resume');
    await click(p,'related');
    assert.ok(await p.evaluate(key=>__peek().qs.every(q=>q.key!==key),saved.key));
    await click(p,'go','[data-to="home"]'); await click(p,'practice-time'); await play(p,'kuho');
    assert.equal(await p.locator('#tm').count(),0);
    console.log('✔ 中断取消3経路・モーダル入力・自動保存・解説後の再開・類題・無制限練習');
  }
  {
    const p=await fresh(); await click(p,'go','[data-to="lessons"]'); await click(p,'lesson','[data-id="ls01"]');
    assert.equal(await p.locator('.lesson-body .kc').getAttribute('data-kanji'),'習');
    await p.screenshot({path:path.join(out,'lesson-mobile.png'),fullPage:true});
    await click(p,'tate'); assert.equal(await p.locator('.lesson-body .kc').getAttribute('data-kanji'),'習');
    await noOverflow(p);
    console.log('✔ 講座の返り点は縦・横ともに漢字に接続');
  }
  {
    const p=await fresh({srs:{'kt:kt01':{r:0,w:1,t:1},'ok:ok01':{r:0,w:1,t:1},'nb:nb01':{r:0,w:1,t:1}}});
    await play(p,'weak');
    for (const kind of ['kaeriten','okiji','narabe']) {
      await click(p,'review-kind','[data-kind="'+kind+'"][data-due="0"]');
      assert.equal(await p.evaluate(()=>__peek().items.length),1);
      if(kind==='kaeriten') {
        const order=await p.evaluate(()=>__peek().items[0].order); for(const i of order) await click(p,'kt','[data-i="'+i+'"]');
      } else if(kind==='okiji') {
        const order=await p.evaluate(()=>__peek().items[0].okiji); for(const i of order) await click(p,'ok','[data-i="'+i+'"]'); await click(p,'okjudge');
      } else {
        const n=await p.evaluate(()=>__peek().items[0].parts.length); for(let i=0;i<n;i++) await click(p,'nbpush','[data-i="'+i+'"]'); await click(p,'nbjudge');
      }
      const n=await p.evaluate(()=>Store.state.answered);
      await p.reload(); await click(p,'resume');
      assert.equal(await p.evaluate(()=>Store.state.answered),n);
      assert.ok(await p.locator('#vd').textContent());
      await click(p,kind==='kaeriten'?'ktnext':kind==='okiji'?'oknext':'nbnext');
      await click(p,'review');
    }
    assert.equal(await p.evaluate(()=>QuizGen.reviewItems(false).length),0);
    console.log('✔ 全パズルの弱点復習と回答済み状態の再開（重複記録なし）');
  }
  {
    const p=await fresh();
    for(let round=0;round<2;round++) {
      await play(p,'mogi');
      for(let i=0;i<20;i++){await answer(p,i!==0);await click(p,'next');}
      assert.equal(await p.evaluate(()=>Store.state.examLast.correct),19);
      assert.ok((await p.locator('.l-table').textContent()).includes('訓読・識別'));
      if(round===1) assert.ok((await p.locator('#app').textContent()).includes('前回 95 点 → 今回 95 点'));
      await click(p,'go','[data-to="home"]');
    }
    console.log('✔ 実力テストの採点・分野別結果・前回比較');
  }
  {
    const seed={foesCleared:['f1','f2','f3','f4','f5','f6','f7','f8'],ach:['a10'],xp:8500};
    const p=await fresh(seed);
    await click(p,'journey'); await noOverflow(p);
    assert.equal(await p.locator('[data-act="stage"][data-i="8"]').isEnabled(),true);
    assert.equal(await p.locator('[data-act="stage"][data-i="9"]').isDisabled(),true);
    await p.screenshot({path:path.join(out,'journey-mobile.png'),fullPage:true});
    await click(p,'go','[data-to="home"]'); await play(p,'battle');
    assert.equal(await p.evaluate(()=>__peek().foeIdx),8);
    await p.screenshot({path:path.join(out,'volume-two-intro.png'),fullPage:true});
    for(let gate=8;gate<16;gate++) {
      assert.equal(await p.evaluate(()=>__peek().foeIdx),gate);
      await click(p,'foego');
      assert.ok(await p.evaluate(()=>{
        const qs=__peek().qs;
        return qs.every((q,i)=>!i || QuizGen.passageKey(q)!==QuizGen.passageKey(qs[i-1]));
      }));
      if(gate===8) {
        await p.screenshot({path:path.join(out,'volume-two-question.png'),fullPage:true});
        await click(p,'quit'); await p.keyboard.press('Escape');
        const t=await p.evaluate(()=>__peek().left); await p.waitForTimeout(250);
        assert.ok(await p.evaluate(()=>__peek().left)<t);
      }
      for(let step=0;step<24;step++) {
        await answer(p); await click(p,'next');
        if(await p.locator('.gate-clear').count()) break;
      }
      assert.equal(await p.locator('.gate-clear').count(),1);
      if(gate===8) {
        const old=await p.evaluate(()=>({g:__peek().gates,s:__peek().score,a:Store.state.answered}));
        await p.reload(); await click(p,'resume');
        assert.deepEqual(await p.evaluate(()=>({g:__peek().gates,s:__peek().score,a:Store.state.answered})),old);
      }
      if(gate<15) await click(p,'foenext'); else await click(p,'bend');
    }
    const state=await p.evaluate(()=>Store.state);
    assert.equal(state.foesCleared.length,16); assert.ok(state.ach.includes('a10')); assert.ok(state.ach.includes('a14'));
    assert.equal(state.session,null);
    await p.screenshot({path:path.join(out,'volume-two-cleared.png'),fullPage:true});
    await click(p,'go','[data-to="home"]'); await click(p,'journey');
    assert.equal(await p.locator('[data-act="stage"]:not([disabled])').count(),16);
    console.log('✔ 旧全クリ記録 → 第9関門 → 第二巻全8関門突破・途中再開・称号・再挑戦');
  }
  {
    const p=await fresh(null,1280); await noOverflow(p);
    await p.screenshot({path:path.join(out,'home-desktop.png'),fullPage:true});
    await click(p,'theme'); await click(p,'theme'); await click(p,'journey');
    await p.screenshot({path:path.join(out,'journey-dark.png'),fullPage:true}); await noOverflow(p);
    await p.setViewportSize({width:320,height:700}); await noOverflow(p);
    console.log('✔ PC・スマホ・320px幅・ダーク表示');
  }
  assert.deepEqual(errors,[]);
  console.log('✔ 回帰テスト完了');
} finally { await browser.close(); }
