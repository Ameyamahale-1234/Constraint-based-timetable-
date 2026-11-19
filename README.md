# Constraint-based-timetable 
Constraint-Based Academic Timetable Generation  System
Academic Timetable Generation System

Project Overview

Class Sync is a constraint-based academic timetable generation system designed to simplify the process of preparing college timetables. It aims to reduce manual effort, prevent scheduling conflicts, and improve the accuracy of timetable preparation.

The system manages academic information, validates scheduling constraints, generates timetable assignments, and provides a facility for reviewing and approving the final timetable.

Objectives

Automate academic timetable generation.

Validate faculty, classroom, and laboratory availability.

Detect and resolve scheduling conflicts.

Support division-wise and batch-wise timetable allocation.

Allow coordinators to review, revise, and approve generated timetables.

Generate timetable reports for academic use.

Main Engines

E1 – Academic Data Management: Manages courses, faculty, rooms, laboratories, divisions, batches, and time slots.

E2 – Constraint & Validation: Validates academic data and checks scheduling constraints.

E3 – Scheduling & Conflict Resolution: Generates timetables using a greedy algorithm and attempts conflict resolution using backtracking.

E4 – Timetable Review & Visualization: Displays generated timetables, supports review and revision, and facilitates approval and publication.

Key Features

Academic data management

Faculty and room availability checks

Scheduling constraint validation

Timetable generation

Conflict detection and resolution

Division-wise and batch-wise timetable viewing

Timetable review and approval

Report generation

Technologies and Algorithms

The planned scheduling approach includes greedy scheduling for initial timetable generation and backtracking for resolving conflicts. The implementation technologies and database design will be documented as development progresses.

Project Scope

The initial scope focuses on timetable preparation for the CSE department, including academic data management, scheduling constraints, conflict resolution, and timetable review.

Project Status

Currently in the solution-design and development-planning phase. Architecture diagrams, engine interactions, workflow diagrams, and design documentation are being prepared as part of Sprint 1.

Team Contributions

The project is divided into four engines, with each team member responsible for the design and development of an assigned technical component.

## Run the web app

You need Node.js 18 or newer.

**Option 1: one window (recommended)**

```bash
cd frontend && npm install && npm run build && cd ..
cd server && npm install && npm start
```

Open http://localhost:5050.

**Option 2: development mode, with live reload of the frontend**

```bash
# terminal 1
cd server && npm install && npm start
# terminal 2
cd frontend && npm install && npm run dev
```

Open the address Vite prints, usually http://localhost:5173.

**Using it**

1. Sign in (demo accounts, front-end only): coordinator / `admin123`, faculty / `faculty123`, student / `student123`.
2. **E1 · Academic data** (coordinator): enter Courses, Faculty, Rooms & Labs, Divisions & Batches, Time Slots and Teaching Assignments, or on **Generate Timetable** import an Excel workbook (`samples/ClassSync_sample_input.xlsx` or the larger template) to fill those pages. Leave Time Slots empty to use the default college periods.
3. **E2 · Validation Engine**: load the E1 data, check it for missing values, duplicates and broken references, send it to E3, and re-check E3's result with the conflict graph.
4. **Generate Timetable**: run E3 (greedy placement, backtracking when stuck, independent audit), then approve the conflict-free result. **Conflict Reports** lists the reasons if no timetable is possible.
5. **Timetable**: view by division, teacher or room and download PDF/CSV. After approval, faculty see their own timetable and students see their division's timetable.

Workbook sheets: `Faculty`, `Course`, `Room`, `Course_Faculty` (required); `Division`, `Course_Division` (optional). The `Instructions` sheet in the sample explains every column.

## System Architecture
<p align="center">
  <img src="diagrams/Academic Scheduling System Architecture.png"
       alt="Academic Scheduling System Architecture"
       width="800">
</p>
