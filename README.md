# Draw Guess Team

A browser game for virtual team building. One person draws, teammates guess, and the host runs quick timed rounds with prompts, a drawing board, guess log, reveal button, and scoreboard.

## Run

Run a static preview server for local play, or use GitHub Pages after Firebase is configured.

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Then open http://127.0.0.1:8765/.

## Features

- Timed facilitated rounds with a prompt deck.
- Drawing canvas with pen, eraser, color swatches, brush size, undo, clear, and save.
- Guess log that flags exact correct guesses.
- Session scoreboard for players or teams.
- Round history for the current play session.
- Firebase Realtime Database rooms for remote teammates.
- Responsive layout for desktop and smaller screens.

## Remote Rooms

This static site uses Firebase Realtime Database for multiplayer sync. To enable it:

1. Create a Firebase project at https://console.firebase.google.com.
2. Add a Web App in Firebase project settings.
3. Create a Realtime Database.
4. Copy the Firebase web config into `firebase-config.js`.
5. Publish the updated file to GitHub Pages.

For early team testing, use temporary Realtime Database rules like this:

```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

These open rules are only for quick testing. Before sharing broadly, restrict room writes with Firebase Authentication or short-lived room tokens.

## GitHub

Repository: https://github.com/feyyvonne/draw-guess-team
GitHub Pages: https://feyyvonne.github.io/draw-guess-team/

```sh
git remote add origin https://github.com/feyyvonne/draw-guess-team.git
git push -u origin main
```
