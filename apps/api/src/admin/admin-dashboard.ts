/**
 * Self-contained admin telemetry dashboard (no build step, no deps). The token
 * is read client-side from `?token=` and forwarded to the JSON endpoints, which
 * enforce it server-side via AdminTokenGuard.
 */
export const DASHBOARD_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>ReplyDeck — Admin</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root{--bg:#0c0d10;--card:#16181c;--line:#2a2d33;--fg:#f5f5f7;--mut:#a8aab0;--dim:#6b6e76;--ok:#5dd47e;--warn:#f5b14c;--bad:#f56565;--accent:#6ea8fe}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:28px}
  h1{font-size:22px;font-weight:800;margin:0 0 4px}
  .sub{color:var(--dim);font-size:13px;margin:0 0 24px}
  .cards{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:24px}
  .stat{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px 20px;min-width:120px}
  .stat .n{font-size:26px;font-weight:800}
  .stat .l{color:var(--mut);font-size:12px;text-transform:uppercase;letter-spacing:.04em;margin-top:2px}
  table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:16px;overflow:hidden}
  th,td{padding:11px 14px;text-align:left;font-size:13px;border-bottom:1px solid var(--line)}
  th{color:var(--mut);font-weight:600;text-transform:uppercase;font-size:11px;letter-spacing:.04em}
  tr:last-child td{border-bottom:none}
  .pill{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700}
  .pill.ok{background:#163420;color:var(--ok)} .pill.warn{background:#3a2c12;color:var(--warn)}
  .pill.off{background:#2a2d33;color:var(--dim)} .pill.bad{background:#3a1717;color:var(--bad)}
  .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:var(--dim)}
  .bar{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin:24px 0 10px}
  form{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px 20px;display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin-top:24px}
  label{display:block;font-size:11px;color:var(--mut);margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em}
  input{background:#0c0d10;border:1px solid var(--line);color:var(--fg);border-radius:10px;padding:9px 11px;font-size:14px;min-width:200px}
  button{background:var(--accent);color:#06122e;border:none;border-radius:10px;padding:10px 16px;font-weight:700;font-size:14px;cursor:pointer}
  button.ghost{background:transparent;color:var(--mut);border:1px solid var(--line)}
  #err{color:var(--bad);font-size:13px;margin:12px 0}
  #new{color:var(--ok);font-size:13px;margin:12px 0;font-family:ui-monospace,monospace}
  .empty{color:var(--dim);padding:18px;text-align:center}
</style></head>
<body>
  <h1>ReplyDeck Admin</h1>
  <p class="sub" id="meta">Loading…</p>
  <div id="err"></div>
  <div class="cards" id="stats"></div>
  <table id="tbl"><thead><tr>
    <th>User</th><th>Outlook</th><th>Learning</th><th>Memory</th><th>Cards</th><th>Sent</th><th>Auto-send</th><th>ID</th>
  </tr></thead><tbody id="rows"><tr><td class="empty" colspan="8">Loading…</td></tr></tbody></table>

  <form id="addForm">
    <div><label>New tester email</label><input id="email" type="email" placeholder="guy@example.com" required></div>
    <div><label>Name (optional)</label><input id="name" type="text" placeholder="Guy"></div>
    <button type="submit">Add user</button>
    <button type="button" class="ghost" id="refresh">Refresh</button>
  </form>
  <div id="new"></div>

<script>
  var token = new URLSearchParams(location.search).get("token") || "";
  function q(p){ return p + (p.indexOf("?")<0?"?":"&") + "token=" + encodeURIComponent(token); }
  function pill(cls,txt){ return '<span class="pill '+cls+'">'+txt+'</span>'; }
  function esc(s){ return (s==null?"":String(s)).replace(/[&<>]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;"}[c];}); }

  function render(d){
    document.getElementById("meta").textContent = "Generated " + new Date(d.generatedAt).toLocaleString();
    var t = d.totals, stats = [
      ["Users",t.users],["Connected",t.connected],["Need reconnect",t.needReconnect],
      ["Cards",t.cards],["Sent",t.sent],["Auto-sent",t.autoSent]];
    document.getElementById("stats").innerHTML = stats.map(function(s){
      return '<div class="stat"><div class="n">'+s[1]+'</div><div class="l">'+s[0]+'</div></div>'; }).join("");

    if(!d.users.length){ document.getElementById("rows").innerHTML='<tr><td class="empty" colspan="8">No users yet</td></tr>'; return; }
    document.getElementById("rows").innerHTML = d.users.map(function(u){
      var ol = u.outlook.connected
        ? (u.outlook.needsReconnect ? pill("warn","reconnect") : pill("ok","connected"))
        : pill("off","not connected");
      var learn = u.learning.consent ? pill("ok","consent") : pill("off","no consent");
      var learned = u.learning.lastLearnedAt ? (" · "+u.learning.learnedSampleSize+" samples") : "";
      return "<tr>"
        + "<td><b>"+esc(u.name||"—")+"</b><br><span class='mono'>"+esc(u.email)+"</span></td>"
        + "<td>"+ol+(u.outlook.email?"<br><span class='mono'>"+esc(u.outlook.email)+"</span>":"")+"</td>"
        + "<td>"+learn+learned+"</td>"
        + "<td>"+u.learning.memoryItems+" mem · "+u.learning.senderProfiles+" people</td>"
        + "<td>"+u.cards.total+" ("+u.cards.pending+" pending)</td>"
        + "<td>"+u.cards.sent+"</td>"
        + "<td>"+(u.autoSendEnabled?pill("ok","on"):pill("off","off"))+"</td>"
        + "<td><span class='mono'>"+esc(u.id)+"</span></td>"
        + "</tr>"; }).join("");
  }

  function load(){
    document.getElementById("err").textContent="";
    fetch(q("/admin/overview")).then(function(r){
      if(!r.ok) throw new Error("HTTP "+r.status+(r.status===401?" — bad or missing ?token=":""));
      return r.json();
    }).then(render).catch(function(e){ document.getElementById("err").textContent = e.message; });
  }

  document.getElementById("refresh").onclick = load;
  document.getElementById("addForm").onsubmit = function(e){
    e.preventDefault();
    document.getElementById("new").textContent="";
    var email=document.getElementById("email").value, name=document.getElementById("name").value;
    fetch(q("/admin/users"),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:email,name:name||undefined})})
      .then(function(r){ if(!r.ok) throw new Error("HTTP "+r.status); return r.json(); })
      .then(function(u){ document.getElementById("new").textContent="Created "+u.email+" → user id: "+u.id+"  (bake this into their build as EXPO_PUBLIC_DEV_USER_ID)"; document.getElementById("email").value="";document.getElementById("name").value=""; load(); })
      .catch(function(e){ document.getElementById("err").textContent=e.message; });
  };
  load();
</script>
</body></html>`;
