# Doors Checklist

Android app (React Native) for the quality inspection of **doors and frames**. Each door goes through several stages. Each stage has checklists to fill in, plus measures and photos, and at the end a PDF report is generated. When everything is approved, the door is marked as completed in `[tablename]`.

The app has no business logic of its own: **every checklist, rule and status comes from the server** (`api-mobile/doors/*` routes).

---

## Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Running the app in development](#running-the-app-in-development)
- [Server (backend)](#server-backend)
- [App flow](#app-flow)
- [Key rules](#key-rules)
- [Project structure](#project-structure)
- [Changing a checklist](#changing-a-checklist)
- [Database](#database)
- [Troubleshooting](#troubleshooting)

---

## Requirements

- Node.js 18 or later
- **Yarn** (don't use `npm install`: it fails on `react-native-print`'s peer dependencies)
- JDK 17 and Android Studio / Android SDK
- `adb` on the PATH
- An Android phone or tablet (USB or wireless debugging) or an emulator
- The `server` backend running (see [Server](#server-backend))

## Installation

```sh
yarn install
```

## Running the app in development

| Command | What it does |
|---|---|
| `yarn start` | Starts Metro (the bundler). |
| `yarn android` | Builds and installs the app on the device, and forwards ports 8081 (Metro) and 3000 (server) over USB. |
| `yarn reverse` | Forwards ports 8081 and 3000 again. Use it after unplugging and plugging the phone back in. |
| `yarn wifi` | Connects the device over wireless debugging, forwards the ports, opens Metro if it isn't running, and launches the app (no cable, no new build). Windows only. |
| `yarn lint` | ESLint. |
| `yarn test` | Jest. |

**Wireless debugging (`yarn wifi`)**: the device has to be paired once from *Developer options → Wireless debugging → Pair device with pairing code*, then `adb pair <ip:port>`.

To check types:

```sh
npx tsc --noEmit
```

Main server files:

| File | Purpose |
|---|---|
| `src/lib/doorStages.ts` | **Stages, checklists and their points**, answer validation and statuses (approval, photos, etc.). |
| `src/lib/doorChecklist.ts` | Door data, packing list specs, completing the door (`syncDoorComplete`). |
| `src/lib/doorMeasures.ts` | Door / frame measures. |
| `src/lib/doorActivity.ts` | Logs every action to `[ActivityLog]`. |
| `src/app/api-mobile/doors/*` | Routes used by the app (`login`, `jobs`, `doors`, `label`, `stage`, `review`, `measures`, `photos`, `paperwork`, `reorder`, `report`). |
| `src/app/doors-checklists/*` | Web page in Tafco Admin to view the doors. |

## App flow

1. **Login** with a 4-digit code (`[Users].[Password]`).
2. **Scan**: scan the piece's label (door or frame). The app opens the checklist or the measures that are due.
3. **Measures** (Door / Frame): entered and approved with the ID of an Administrator, Foreman or Door Room Hanger.
4. **Checklists per stage**:
   - **Build**: Door Build QC and Frame Build QC.
   - **Molding**: Door Molding and Frame Molding (written values).
   - **Trimming**: Door Trimmer and Frame Trimmer.
   - **Door Hanger**: filled in by a reviewer (Door Room Hanger / Foreman / Admin).
5. **Approval**: each checklist is saved (SAVE). The answers freeze and the **Edit / APPROVE** buttons appear. APPROVE asks for the approver's ID.
6. **Photos**: required, taken on the door's screen (Photos).
7. **Report**: PDF with the measures, every checklist and the photos (4 per page).

A stage opens once the same piece (door / frame) has passed the stage before. The next stage doesn't wait for approval. Before anything else, someone must confirm the job's paperwork was received.

## Key rules

- **Door completed**: when every checklist is approved **and** the door has at least one photo. It's marked `COMPLETED` in `[table]`.
- **Door Hanger**: not approved (a reviewer fills it in), but it stays **Waiting photos** until the door has photos. When it's saved, the app goes to the door's screen to take them. The first photo completes the door (if everything else is already approved).
- **"allowNo" points** (e.g. *Squared on each side?*): a NO doesn't make the checklist FAILED. It's saved, and when APPROVE is pressed the foreman decides: **Approve as is** or **Send back to fix** (it becomes TO FIX, with only those points open).
- **Any other NO**: the checklist is FAILED and is fixed with Edit.
- **Rejection (TO FIX)**: only the marked points are open. Once they're fixed and saved, it goes back to *Waiting approval*.
- **Reorder** (Door / Frame Molding and Door Hanger): pick the defects, approve with an ID, and print the NCM label. Everything captured for that piece in every stage is erased. The piece stays locked until its new label is scanned and "Yes, new piece" is confirmed.
- **User** (master admin): can open any stage even when it's locked, and is **never asked to type an ID**: approves directly. The list is `UNLOCK_ALL_USERS` in [src/api.ts](src/api.ts) and must match the server's (`doorStages.ts`).
- **Activity log**: every action (save, edit, approve, reject, measures, photos, reorder, paperwork) is logged to `[ActivityLog]`. New routes must log too.

## Project structure

```
App.tsx                     Navigation (stack) and screens
src/
  api.ts                    API_BASE, types shared with the server, special users
  navigation.ts             Route types and resetToStart()
  theme.ts, stageTheme.ts   Colors and shared styles
  hooks/useUser.ts          Logged-in user
  screens/
    LoginScreen             4-digit code
    ScanScreen              Scan a label (home screen)
    JobsScreen, JobMenuScreen, StageDoorsScreen
                            Manual search of jobs / doors by stage
    StageScreen             One stage of one door: checklists, photos, report
    PieceMeasuresScreen     Door / frame measures
    PartChecklistScreen     Fill in, save, approve, reject, reorder
    PhotosScreen            Door photos
    ReportScreen            View / print the PDF
  components/
    ApproverModal           Keypad for the approver's ID
    ApprovalSteps           Notice → summary → ID (measures, reorder)
    ReorderModal, NcmLabelModal
                            Reorder and NCM label
    Dropdown, Header, UserHeader, StageStatusBadge
scripts/
  adb-reverse.js            yarn reverse
  wifi-device.js            yarn wifi
```

## Changing a checklist

The points of each checklist are defined **only on the server**, (`FRAME_BUILD`, `DOOR_BUILD`, `FRAME_TRIM`, `DOOR_TRIM`, `DOOR_HANGER`, `MOLDING`). The app receives them when a stage is opened.

Each point (`CheckItem`) can have:

| Field | Effect in the app |
|---|---|
| `allowNA` | N/A button besides YES. |
| `allowNo` | NO button; the foreman decides at approval (not FAILED). |
| `choices` | Custom options instead of YES / NO. |
| `type: 'text'` / list | "Type" field (text, or chips / dropdown). `optionalType` makes it optional. |
| `quantity` | Qty field (number ≥ 1). |
| `measurement` | Measurement field. |
| `noAnswer` | No YES / NO: only what's written in (Qty, measurement, inputs). |
| `inputs` | Named inputs on the same line (e.g. Heat: Ohm, Length). |
| `field` | Written value (Molding). |

- **List-only changes** (adding, removing or changing a point using existing field types): deploying the server is enough.
- **A new field type**: also change [src/screens/PartChecklistScreen.tsx](src/screens/PartChecklistScreen.tsx) (rendering and `missingFor`), [src/api.ts](src/api.ts) (types) and the report (`api-mobile/doors/report/route.ts`), and ship a new app build.

Answers are saved as JSON per checklist. Saved checklists are not migrated: if a point changes, it gets updated when someone edits that checklist.

## Troubleshooting

- **The app can't reach the server**: check that `server` is running (`yarn dev`) and that `API_BASE` has the right IP. Over USB, run `yarn reverse`.
- **Red screen "Unable to load script"**: Metro isn't running (`yarn start`) or `yarn reverse` is missing.
- **`npm install` fails**: use `yarn install`.
- **A checklist change doesn't show up**: the points come from the server; restart or redeploy `server`.
