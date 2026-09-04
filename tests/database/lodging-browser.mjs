import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { root } from "../../scripts/database-local.mjs";

// Optional existing Playwright runtime, not a new application dependency.
export async function verifyLodgingBrowser(base, jar) {
  assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/);
  if(!process.env.PLAYWRIGHT_MODULE_PATH) throw new Error("Existing Playwright runtime path required");
  const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
  const browser=await chromium.launch({channel:"chrome",headless:true});
  const context=await browser.newContext();
  await context.route("**/*",route=>{
    const url=new URL(route.request().url());
    if(["127.0.0.1","localhost"].includes(url.hostname)) return route.continue();
    return route.abort();
  });
  await context.addCookies([...jar].map(([name,value])=>({name,value,url:base,httpOnly:true,sameSite:"Lax"})));
  const page=await context.newPage();
  const errors=[]; page.on("pageerror",()=>errors.push("pageerror"));
  const output=join(root,"outputs/t2"); mkdirSync(output,{recursive:true});
  try{
    for(const width of [390,1280]) {
      await page.setViewportSize({width,height:900});
      for(const path of ["/admin/tarifas","/admin/calendario","/disponibilidad"]) {
        const response=await page.goto(base+path,{waitUntil:"networkidle"});
        assert.equal(response.status(),200,`${path} response`);
        assert.equal(await page.locator("[data-nextjs-dialog],.vite-error-overlay").count(),0,"no error overlay");
        assert.ok((await page.locator("h1").innerText()).length>0,"meaningful page");
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),`${path} ${width}: no viewport overflow`);
        const unlabeled=await page.locator("input:not([type=hidden]),select,textarea").evaluateAll(elements=>elements.filter(el=>!el.labels?.length&&!el.getAttribute("aria-label")&&!el.getAttribute("aria-labelledby")).length);
        assert.equal(unlabeled,0,"all fields have labels");
        await page.keyboard.press("Tab");
        assert.ok(await page.evaluate(()=>document.activeElement!==document.body),"keyboard focus available");
        await page.screenshot({path:join(output,`${path.split('/').filter(Boolean).join('-')}-${width}.png`),fullPage:true});
        console.log(`PASS: browser ${path} ${width}px, labels/keyboard/no overflow/no overlay`);
      }
    }
    assert.equal(errors.length,0,"no browser runtime errors");
  }finally{await context.close();await browser.close();}
}
