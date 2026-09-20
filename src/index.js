const MAX_PLAYERS = 8;
const MAX_QUESTION_LENGTH = 300;
const MAX_OTHER_LENGTH = 120;

const responseJSON = (data, status=200) => new Response(JSON.stringify(data), {
  status, headers: {"content-type":"application/json; charset=utf-8"}
});

function clean(value, max) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}
function moderate(text) {
  return !String(text).toLowerCase().includes("spamspamspam");
}
function newCode() {
  const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({length:6},()=>chars[Math.floor(Math.random()*chars.length)]).join("");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return responseJSON({ok:true});

    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      const code = url.pathname.split("/")[2]?.toUpperCase();
      if (!code || !/^[A-Z0-9]{6}$/.test(code)) return responseJSON({error:"Invalid room code"},400);
      return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(request);
    }

    if (url.pathname === "/api/new-room") return responseJSON({code:newCode()});
    if (url.pathname.startsWith("/room/")) {
      return env.ASSETS.fetch(new Request(new URL("/", request.url), request));
    }
    return env.ASSETS.fetch(request);
  }
};

export class FishbowlRoom {
  constructor(ctx) {
    this.ctx=ctx;
    this.players=new Map();
    this.hostId=null;
    this.started=false;
    this.questions=[];
    this.current=null;
    this.answers=new Map();
  }

  async fetch(request) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
      return responseJSON({ok:true, playerCount:this.players.size, started:this.started});

    const pair=new WebSocketPair();
    const client=pair[0], ws=pair[1];
    ws.accept();

    const u=new URL(request.url);
    const id=clean(u.searchParams.get("playerId") || crypto.randomUUID(),80);
    const name=clean(u.searchParams.get("name") || "Player",30);

    if (this.players.size>=MAX_PLAYERS && !this.players.has(id)) {
      ws.send(JSON.stringify({type:"error",message:"Room is full (maximum 8 players)."}));
      ws.close();
      return new Response(null,{status:101,webSocket:client});
    }
    if (!this.hostId) this.hostId=id;
    this.players.set(id,{name,ws});

    ws.addEventListener("message",e=>this.handle(id,e.data));
    ws.addEventListener("close",()=>this.remove(id));
    this.sendState(id);
    this.broadcast();

    return new Response(null,{status:101,webSocket:client});
  }

  async handle(id, raw) {
    let m; try { m=JSON.parse(raw); } catch { return; }
    if (m.type==="start" && id===this.hostId && !this.started) {
      this.started=true; this.draw(); return;
    }
    if (m.type==="submit_question") {
      const text=clean(m.text,MAX_QUESTION_LENGTH);
      if (text && moderate(text) && !this.questions.some(q=>q.text.toLowerCase()===text.toLowerCase()))
        this.questions.push({id:crypto.randomUUID(),text,authorId:id});
      this.broadcast(); return;
    }
    if (m.type==="answer" && this.current && !this.answers.has(id)) {
      const choice=["yes","no","other"].includes(m.choice)?m.choice:null;
      const other=choice==="other"?clean(m.text,MAX_OTHER_LENGTH):"";
      if (!choice || (choice==="other" && !other) || !moderate(other)) return;
      this.answers.set(id,{choice,other});
      if (this.answers.size>=this.players.size) this.results(); else this.broadcast();
      return;
    }
    if (m.type==="skip" && id===this.hostId) this.draw();
    if (m.type==="next" && id===this.hostId) this.draw();
  }

  remove(id) {
    this.players.delete(id);
    if (this.hostId===id) this.hostId=this.players.keys().next().value || null;
    this.broadcast();
  }

  draw() {
    if (!this.questions.length) {
      this.current=null; this.answers.clear(); this.broadcast(); return;
    }
    const q=this.questions.splice(Math.floor(Math.random()*this.questions.length),1)[0];
    this.current={id:q.id,text:q.text,authorId:q.authorId};
    this.answers.clear();
    this.broadcast();
  }

  sendState(id) {
    const p=this.players.get(id); if(!p) return;
    const payload={
      type:"state",
      room:{playerCount:this.players.size,maxPlayers:MAX_PLAYERS,isHost:id===this.hostId,started:this.started,questionsRemaining:this.questions.length},
      current:this.current?{id:this.current.id,text:this.current.text}:null,
      answered:this.answers.has(id)
    };
    try{p.ws.send(JSON.stringify(payload));}catch{}
  }

  broadcast(){for(const id of this.players.keys())this.sendState(id);}

  results() {
    const values=[...this.answers.values()];
    const payload=JSON.stringify({
      type:"results",
      yes:values.filter(a=>a.choice==="yes").length,
      no:values.filter(a=>a.choice==="no").length,
      other:values.filter(a=>a.choice==="other").map(a=>a.other)
    });
    for(const p of this.players.values()) try{p.ws.send(payload)}catch{}
  }
}
