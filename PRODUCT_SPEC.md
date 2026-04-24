# WhatsApp School Communication System - Complete Project Documentation

## Quick Reference

**One-Liner:** WhatsApp meets AI agents for schools — parents get proactive updates and ask questions naturally, no app required.

**Project:** Campus Cortex AI - Agentic Communication Hub  
**Problem ID:** KR0461  
**Team:** 4 people  
**Timeline:** 4 weeks  
**Tech:** Python + LangGraph + WhatsApp API + PostgreSQL + React

---

## The Problem We're Solving

Parents waste time logging into multiple school portals to check:
- Did my child attend school?
- What did they score on the quiz?
- Is homework submitted?

Information is fragmented across SMS, email, apps, and websites. Parents hunt for information instead of it finding them.

---

## Our Solution

### Two-Mode System

**Mode 1: Proactive (System Pushes)**
- 8 AM: Attendance check-in
- 6 PM: Daily summary
- Instant: Quiz results
- Weekly: Grade reports

**Mode 2: Reactive (Natural Q&A)**
- Parent texts: "How is Arjun doing in Math?"
- AI understands → queries database → responds naturally
- No commands, just conversation

### Key Features

1. **Agentic Backend**: Multi-node LangGraph workflow (not simple chatbot)
2. **Teacher Dashboard**: Upload Excel with grades → Auto-notifies all parents
3. **WhatsApp Integration**: All communication through WhatsApp (no app needed)
4. **PDF Certificates**: Kiosk test + AI analysis → Certificate in 30 seconds
5. **Smart Scheduling**: Messages sent at optimal times

---

## System Architecture Overview

**Components:**
- Teacher Dashboard (React) → Upload files, trigger notifications
- Agentic Backend (LangGraph/CrewAI) → Intent detection, tool calling, response generation
- Database (PostgreSQL) → 8 tables with RBAC and school isolation
- WhatsApp Layer (Evolution/Twilio/Meta API) → Send/receive messages + PDFs
- End Users → Parents, Students, Teachers, Prospects

**Data Flows:**
1. Teacher uploads Excel → Parse → Insert DB → Trigger WhatsApp
2. Parent texts question → Intent detection → Query DB → Natural response
3. 8 AM timer → Query attendance → Batch WhatsApp to all parents
4. Kiosk test → AI analysis → Generate PDF → Send to phone

---

## Database Schema (8 Tables)

**Required tables (exact schema from requirements):**
1. **user**: id, username, password, role (student/parent), school_id, phone_number
2. **parent_student_link**: Links parents to students (requires auth verification)
3. **classroom**: id, name, school_id, teacher_id
4. **classroom_membership**: Students enrolled in classrooms
5. **class_session**: Individual class meetings for attendance
6. **attendance**: student_id, session_id, status (PRESENT/ABSENT/LATE)
7. **assignment**: Homework/quizzes with due dates
8. **assignment_submission**: Scores with percentage calculation

**Critical Business Rules:**
- Attendance % = (PRESENT + LATE) / Total Sessions * 100
- Grade % = AVG(assignment_submission.percentage)
- All queries filtered by school_id (school isolation)
- Students cannot access parent views (RBAC)
- Parent must verify with child's username+password to link

---

## User Stories Summary

### Parents (5 stories)
1. Link child account with credential verification
2. Receive 8 AM attendance notification
3. Ask "How is my child doing?" via WhatsApp
4. Get 6 PM daily summary automatically
5. Receive instant quiz results when submitted

### Students (4 stories)
6. Get quiz score within 1 minute of submission
7. Receive test reminders 1 day before
8. Ask "What's my grade?" via WhatsApp
9. Verify attendance status

### Teachers (4 stories)
10. Mark attendance → Triggers auto-notification
11. Enter grades → Instant WhatsApp to student+parent
12. View notification log to verify delivery
13. Get escalated when AI can't answer parent question

### Kiosk (1 story)
14. Prospect child takes test → AI analysis → PDF certificate to parent's WhatsApp in 30 seconds

---

## 4-Person Team Breakdown

### Person 1: Database Architect + Python Tools

**Week 1:**
- Set up PostgreSQL with exact 8-table schema
- Create seed data: 3 schools, 10 students, 5 parents, 20 attendance records
- Enforce RBAC and school_id isolation

**Week 2:**
- Build query functions: get_attendance(), get_grades(), get_student_summary()
- Build insert functions: insert_attendance_batch(), insert_grades_batch()
- Calculate percentages using correct formulas
- Provide mock responses for others to develop against

**Deliverables:**
- Database ready with test data
- Python query tools module
- Mock data for parallel development

---

### Person 2: WhatsApp Integration Specialist

**Week 1:**
- Set up WhatsApp API (Evolution/Twilio/Meta)
- Build WhatsApp client: send_text_message(), send_pdf_file()
- Set up webhook for incoming messages
- Test with 1 phone number

**Week 2:**
- Parse incoming webhook payloads
- Create message templates: attendance, grades, daily summary
- Build mock WhatsApp client for testing without API quota
- Standardize phone number format (E.164: +919876543210)

**Deliverables:**
- WhatsApp client module
- Message templates
- Mock client for team testing
- Phone number normalization utility

---

### Person 3: Agentic Backend Engineer

**Week 1:**
- Build LangGraph workflow: Intent Detection → Entity Extraction → Tool Calling → Response
- Integrate Gemini for intent classification (Academic/Result/Support)
- Connect to Person 1's mock tools
- Connect to Person 2's mock WhatsApp

**Week 2:**
- Build PDF generator for Learning DNA certificates
- Set up scheduler: 8 AM, 6 PM, weekly jobs
- Create FastAPI endpoints: /incoming-message, /manual-trigger/attendance, /manual-trigger/kiosk
- Handle event triggers (quiz submit → instant notify)

**Deliverables:**
- LangGraph workflow working
- PDF generation
- Scheduler with cron jobs
- REST API endpoints

---

### Person 4: Dashboard Frontend Developer

**Week 1:**
- Build React dashboard UI
- File upload component (Excel/PDF)
- Manual trigger buttons
- Mock backend API for local dev

**Week 2:**
- Excel parsing and validation
- Activity log (polls backend every 5 seconds)
- Database quick view
- Error handling and styling
- Connect to real backend

**Deliverables:**
- React dashboard
- File upload with validation
- Manual triggers
- Activity log display

---

## Integration Gotchas (CRITICAL)

### 1. Phone Number Format
**Issue:** Different formats break message routing
**Fix:** Standardize on E.164 (+919876543210), create shared normalization function

### 2. Date/Time Handling
**Issue:** Local vs UTC causes scheduler to fire at wrong time
**Fix:** Everything in UTC internally, convert to IST only in display

### 3. Student ID vs Name
**Issue:** Parent says "Arjun" but DB needs integer student_id
**Fix:** Person 3 must resolve names to IDs before calling DB tools

### 4. Excel Column Mapping
**Issue:** Upload has "Name, Score" but DB expects student_id, assignment_id
**Fix:** Person 4 validates and transforms before sending to backend

### 5. Error Response Format
**Issue:** Inconsistent error formats break error handling
**Fix:** Standardize: {success: true/false, data: {...}, error: {code, message}}

### 6. Environment Variables
**Issue:** Hardcoded keys break when rotated
**Fix:** Shared .env file, never commit, all components load from env

### 7. PDF File Paths
**Issue:** Different components using different storage locations
**Fix:** Define standard path in shared config, everyone uses it

### 8. Async Processing
**Issue:** Scheduled job blocks sending 100 messages
**Fix:** Use Celery/RQ for async task queue

### 9. Testing Mode
**Issue:** Can't test without burning API quota
**Fix:** Mock mode toggle (MOCK_WHATSAPP=true)

### 10. Database Connection
**Issue:** Team members using different DB instances
**Fix:** Share single Supabase instance or Docker Compose PostgreSQL

---

## Integration Timeline

### Week 1: Foundation
- Person 1: DB + seed data
- Person 2: WhatsApp client + mock
- Person 3: Intent detection + mocks
- Person 4: UI wireframes + mock API
**Checkpoint:** Everyone connected to shared DB, env vars shared, mocks working

### Week 2: Core Features
- Person 1: All query tools done
- Person 2: Send/receive working
- Person 3: Full LangGraph workflow
- Person 4: File upload + triggers
**Checkpoint:** Real integrations working between components

### Week 3: End-to-End
- Day 1-2: Reactive flow (ask question → get answer)
- Day 3-4: Proactive (8 AM, 6 PM notifications)
- Day 5-6: Kiosk + PDF
- Day 7: Dashboard integration

### Week 4: Demo Prep
- End-to-end testing
- Error handling
- UI polish
- Demo practice

---

## Demo Flow

**Setup:** 3 phones (Teacher, Parent, Student)

**Sequence:**
1. **Dashboard**: Show UI, explain manual triggers
2. **Upload Grades**: Select Excel → 5 records inserted → Activity log updates
3. **WhatsApp Arrive**: Parent and student phones show "Arjun scored 92/100"
4. **Ask Question**: Parent texts "How is Arjun in Math?" → Natural response in 10 seconds
5. **Trigger Attendance**: Click button → WhatsApp shows "Arjun marked PRESENT ✅"
6. **Kiosk PDF**: Generate certificate → Arrives on phone in 30 seconds

**Closing:** "Production-ready with agentic AI, RBAC, school isolation, WhatsApp integration. Zero friction for parents, zero extra work for teachers."

---

## Pre-Integration Checklist

**Person 1:**
- [ ] Standardized return format
- [ ] Mock responses documented
- [ ] 10+ test records in DB
- [ ] Function signatures documented

**Person 2:**
- [ ] Mock client works offline
- [ ] Real API tested with 1 number
- [ ] Webhook endpoint documented
- [ ] Phone normalization ready

**Person 3:**
- [ ] Runs without real LLM (mocks)
- [ ] All endpoints return JSON
- [ ] Scheduler manually triggerable
- [ ] PDF generation works
- [ ] Error handling complete

**Person 4:**
- [ ] Mock/real backend toggle
- [ ] File validation before send
- [ ] Clear error messages
- [ ] Activity log polls correctly
- [ ] UI styled and responsive

---

## Key Talking Points

**Problem:** "Parents waste time in 5 portals. We put everything on WhatsApp."

**Tech:** "Multi-node LangGraph workflow, not simple keyword matching."

**UX:** "Zero app downloads, zero logins, zero commands. Just conversation."

**Business Logic:** "Production-ready RBAC, school isolation, accurate formulas."

**Automation:** "Scheduled + event-driven. Proactive AND reactive."

**Differentiation:** "Most teams build chatbots. We built agentic intelligence."

---

## Success Metrics

**Technical:**
- All 4 phases working (Reactive, Proactive, PDF, Dashboard)
- Database matches exact requirements
- Business formulas correct
- WhatsApp reliable send/receive
- LangGraph routing accurate

**UX:**
- Parent gets attendance < 1 minute
- Natural language works
- PDF < 30 seconds
- Dashboard intuitive

**Demo:**
- Live end-to-end works smoothly
- Judges understand agentic architecture
- Clear differentiation shown
- Professional presentation

---

END OF DOCUMENTATION