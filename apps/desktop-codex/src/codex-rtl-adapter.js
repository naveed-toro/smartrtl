// Preview adapter. The frozen shared core is the only direction rule.
(function () {
  if (location.protocol !== 'app:' || location.hostname !== '-') return;
  if (window.__smartRtlCodex) return;
  const state = {engine:null, error:null};
  const USER = '[data-message-author-role="user"],[data-testid="user-message"]';
  const config = {
    // Main content only; never the navigation, dialogs, editors or preformatted code.
    // Per-block application also covers sent messages rendered as ordinary paragraphs.
    answers: {within:'main,[role="main"],[data-message-author-role="assistant"],[data-testid="assistant-message"],.markdown',
      skip:'nav,aside,[role="navigation"],[role="dialog"],[aria-hidden="true"],.sr-only'},
    composer: {input:['.ProseMirror[contenteditable="true"][role="textbox"]','.ProseMirror[contenteditable="true"]'],mirror:[]},
    sent: {runs:'[data-message-author-role="user"] p,[data-message-author-role="user"] [dir="auto"],[data-testid="user-message"] p,[data-testid="user-message"] [dir="auto"]',
      not:'pre,code,[contenteditable="true"],[data-message-author-role="assistant"],[data-testid="assistant-message"]'}
  };
  function start(){try{state.engine=SmartRTLDom.start(SmartRTL,config);if(!state.engine)state.error='Shared engine did not start'}catch(e){state.error=String(e.message||e)}}
  window.__smartRtlCodex = {
    status(){
      const engine=state.engine?.status()??null;
      const composer=document.querySelector(config.composer.input.join(','));
      const rootCount=document.querySelectorAll(config.answers.within).length;
      return {version:2,mode:'preview',rule:'openingLetters, 63 letters',engine,error:state.error,
        document:{href:location.href,readyState:document.readyState,elements:document.querySelectorAll('*').length,iframes:document.querySelectorAll('iframe').length,
          topChildren:Array.from(document.body?.children??[]).slice(0,12).map(e=>({tag:e.tagName,id:e.id,classes:typeof e.className==='string'?e.className.slice(0,120):'',shadow:!!e.shadowRoot})),
          editorCandidates:Array.from(document.querySelectorAll('[contenteditable],textarea,[role="textbox"]')).slice(0,8).map(e=>({tag:e.tagName,classes:typeof e.className==='string'?e.className:'',role:e.getAttribute('role'),editable:e.getAttribute('contenteditable')}))},
        found:{answerRoots:rootCount,composer:!!composer,userContainers:document.querySelectorAll(USER).length},
        // Structure only, no message text, draft contents, or account details.
        structure:Array.from(document.querySelectorAll('[data-bidi],.ProseMirror,[data-message-author-role],[data-testid="user-message"]')).slice(0,15).map(e=>({
          tag:e.tagName,classes:typeof e.className==='string'?e.className.slice(0,180):'',
          role:e.getAttribute('data-message-author-role'),direction:getComputedStyle(e).direction,
          chain:Array.from((function*(el){for(let i=0;el&&i<4;i++,el=el.parentElement)yield el})(e)).map(p=>({tag:p.tagName,classes:typeof p.className==='string'?p.className.slice(0,180):'',testid:p.getAttribute('data-testid')}))
        }))};
    },
    stop(){state.engine?.stop();state.engine=null;state.error='Stopped by user'}
  };
  if(document.documentElement)start();else document.addEventListener('DOMContentLoaded',start,{once:true});
})();
