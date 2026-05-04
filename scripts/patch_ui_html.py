from pathlib import Path
import re

ui_path = Path('/home/user/work/domino/client/static/domino-mesa/ui.js')
html_path = Path('/home/user/work/domino/client/static/domino-mesa/index.html')

ui = ui_path.read_text()
ui = ui.replace("scene.applyExternalProfile(event.data.profile || null);", "scene.applyExternalProfile({ profile: event.data.profile || null, stats: event.data.stats || null });")
ui_path.write_text(ui)

html = html_path.read_text()
html = html.replace("""    #action-panel {
      position: absolute;
      bottom: 20px;
      right: 250px;
      width: auto;
      padding: 0;
      display: flex;
      gap: 12px;
      align-items: center;
      background: transparent;
      border: none;
      box-shadow: none;
    }

    .action-panel__header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
    }

    .action-panel__title { font-size: 16px; font-weight: 900; }
    .action-panel__hint { font-size: 12px; color: rgba(255,255,255,0.70); line-height: 1.45; }

    .score-stepper {
      display: flex;
      gap: 4px;
      align-items: center;
      width: auto;
    }

    .score-stepper .hud-btn {
      min-height: 34px;
      padding: 6px 9px;
      font-size: 14px;
      font-weight: 800;
      flex: none;
    }

    .score-pill {
      min-height: 34px;
      min-width: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      border: 1px solid rgba(255,255,255,0.14);
      background: rgba(255,255,255,0.08);
      font-size: 16px;
      font-weight: 900;
      color: white;
      letter-spacing: 0.04em;
      flex: none;
    }

    .action-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 4px;
      width: 80px;
    }

    .action-grid .hud-btn {
      min-height: 26px;
      padding: 2px 3px;
      font-size: 13px;
      font-weight: 800;
      aspect-ratio: 1.5;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0;
      border-radius: 5px;
    }
""", """    #action-panel {
      position: absolute;
      bottom: 20px;
      right: 220px;
      min-width: 380px;
      padding: 14px;
      display: grid;
      gap: 12px;
      background: rgba(3,7,18,0.86);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 20px;
      box-shadow: var(--hud-shadow);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }

    .action-panel__header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
    }

    .action-panel__title { font-size: 16px; font-weight: 900; }
    .action-panel__hint { font-size: 12px; color: rgba(255,255,255,0.70); line-height: 1.45; }

    .action-panel__body {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(148px, 164px);
      gap: 12px;
      align-items: stretch;
    }

    .score-stepper {
      display: grid;
      grid-template-columns: 56px minmax(72px, 1fr) 56px;
      gap: 8px;
      align-items: center;
      width: 100%;
    }

    .score-stepper .hud-btn {
      min-height: 50px;
      padding: 0;
      font-size: 18px;
      font-weight: 900;
      flex: none;
    }

    .score-pill {
      min-height: 50px;
      min-width: 72px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,0.14);
      background: rgba(255,255,255,0.08);
      font-size: 21px;
      font-weight: 900;
      color: white;
      letter-spacing: 0.04em;
      flex: none;
    }

    .action-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
      width: 100%;
    }

    .action-grid .hud-btn {
      min-height: 50px;
      padding: 0 10px;
      font-size: 15px;
      font-weight: 900;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 14px;
    }
""")

html = html.replace("""      #action-panel {
        position: static;
        left: auto;
        transform: none;
        width: 100%;
        padding: 8px;
        display: grid;
        gap: 8px;
        background: var(--panel-bg);
        border: 1px solid var(--panel-border);
        border-radius: 12px;
        box-shadow: var(--hud-shadow);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
      }
      .action-grid { width: 100%; max-width: none; }
""", """      #action-panel {
        position: static;
        left: auto;
        transform: none;
        width: 100%;
        min-width: 0;
        padding: 12px;
      }
      .action-panel__body { grid-template-columns: 1fr; }
      .action-grid { width: 100%; max-width: none; }
""")

html = html.replace("""      .action-grid { grid-template-columns: 1fr; max-width: none; }
      .action-grid .hud-btn { aspect-ratio: auto; min-height: 28px; }
""", """      .action-panel__body { grid-template-columns: 1fr; }
      .action-grid { grid-template-columns: 1fr; max-width: none; }
      .action-grid .hud-btn { aspect-ratio: auto; min-height: 46px; }
""")

html = html.replace("""      #action-panel { bottom: 15px; right: 120px; gap: 8px; }
      .action-grid .hud-btn { min-height: 24px; font-size: 12px; }
      .score-stepper .hud-btn { min-height: 30px; }
      .score-pill { min-height: 30px; min-width: 38px; font-size: 15px; }
""", """      #action-panel { bottom: 15px; right: 110px; gap: 8px; }
      .action-grid .hud-btn { min-height: 42px; font-size: 13px; }
      .score-stepper .hud-btn { min-height: 42px; }
      .score-pill { min-height: 42px; min-width: 58px; font-size: 18px; }
""")

html = html.replace("""      <section id="action-panel" aria-label="Ações da jogada humana">
        <div class="score-stepper">
          <button id="points-minus" class="hud-btn hud-btn--ghost" type="button">−5</button>
          <div id="points-value" class="score-pill">0</div>
          <button id="points-plus" class="hud-btn hud-btn--ghost" type="button">+5</button>
        </div>

        <div class="action-grid">
          <button id="galo-button" class="hud-btn hud-btn--warning" type="button">🐓 GALO</button>
          <button id="pass-turn-button" class="hud-btn hud-btn--danger" type="button">✋ PASSEI</button>
        </div>
      </section>
""", """      <section id="action-panel" aria-label="Ações da jogada humana">
        <div class="action-panel__header">
          <div>
            <div class="action-panel__title">Painel da jogada</div>
            <div id="action-hint" class="action-panel__hint">Informe os pontos em múltiplos de 5, use GALO quando necessário e passe apenas se não houver encaixe.</div>
          </div>
        </div>
        <div class="action-panel__body">
          <div class="score-stepper">
            <button id="points-minus" class="hud-btn hud-btn--ghost" type="button">−5</button>
            <div id="points-value" class="score-pill">0</div>
            <button id="points-plus" class="hud-btn hud-btn--ghost" type="button">+5</button>
          </div>

          <div class="action-grid">
            <button id="galo-button" class="hud-btn hud-btn--warning" type="button">🐓 GALO</button>
            <button id="pass-turn-button" class="hud-btn hud-btn--danger" type="button">✋ PASSEI</button>
          </div>
        </div>
      </section>
""")

html_path.write_text(html)
print('patched ui/html')
