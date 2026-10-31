ESSEN TRACKER – UPDATE v47

WICHTIGER FEHLER BEHOBEN:
- Ein alter Code aus v37 hat „Heute für mich“ und den Notizzettel nach dem Laden
  noch einmal in einen anderen Container verschoben.
- Genau deshalb sprang die Ansicht beim Aktualisieren zuerst hoch und kurz danach wieder runter.
- Dieser alte Code und die dazugehörigen CSS-Regeln wurden vollständig entfernt.

Dadurch:
- keine nachträgliche Verschiebung mehr nach 80/120/400 ms
- die Kartengrößen und Positionen bleiben so, wie sie direkt beim Laden erscheinen
- die v46-Schrift- und Tagesbereichsänderungen bleiben erhalten
