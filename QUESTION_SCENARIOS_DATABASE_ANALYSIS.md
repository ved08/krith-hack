# Comprehensive Question Scenarios & Database Schema Analysis

## Purpose
This document catalogs all possible parent and student questions to validate and refine the database schema. Each category includes example questions and their database requirements.

---

## CATEGORY 1: ATTENDANCE QUERIES

### 1.1 Simple Attendance Questions

**Parent Questions:**
1. "Was Arjun present today?"
2. "Did my son attend school?"
3. "Is my child at school?"
4. "Was Priya marked present?"
5. "Did Arjun go to class today?"

**Student Questions:**
6. "Was I present today?"
7. "Did I attend Math class?"
8. "Am I marked present?"

**Database Requirements:**
- **Tables:** `attendance` JOIN `class_session`
- **Query Logic:** Filter by student_id, date = today
- **Return:** status (PRESENT/ABSENT/LATE)

**Schema Validation:**
- ✅ Current schema supports this
- `attendance.status` has PRESENT/ABSENT/LATE enum
- `class_session.date` allows date filtering

---

### 1.2 Attendance Percentage Questions

**Parent Questions:**
9. "What is Arjun's attendance percentage?"
10. "How many days has my child attended?"
11. "What's his overall attendance?"
12. "How many classes has Priya missed?"
13. "Show me attendance for this month"
14. "What percentage of classes did he attend?"

**Student Questions:**
15. "What's my attendance?"
16. "How many days have I missed?"
17. "Am I below 75% attendance?"

**Database Requirements:**
- **Tables:** `attendance` JOIN `class_session` JOIN `classroom_membership`
- **Calculation:** (COUNT(PRESENT) + COUNT(LATE)) / COUNT(total_sessions) * 100
- **Filters:** student_id, optional date range
- **Return:** 
  - percentage (float)
  - present_count (int)
  - absent_count (int)
  - late_count (int)
  - total_sessions (int)

**Schema Validation:**
- ✅ Current schema supports this
- Formula: (PRESENT + LATE) / Total * 100 is documented
- Can aggregate across all enrolled classrooms

**Edge Cases:**
- "This month" → need date range parsing (first day of month to today)
- "Last week" → need to calculate date range
- Multiple classrooms → need to join classroom_membership to get all classrooms student is in
- No sessions yet → handle divide by zero

**Potential Schema Enhancement:**
- Consider adding `attendance_summary` materialized view for performance:
  ```
  attendance_summary (student_id, period, present_count, absent_count, late_count, total_sessions, percentage)
  ```

---

### 1.3 Date-Specific Attendance

**Parent Questions:**
18. "Was Arjun present on Monday?"
19. "Did he attend last week?"
20. "Show me attendance for January"
21. "Was he there on 15th January?"
22. "Did he miss any classes last month?"

**Database Requirements:**
- **Tables:** `attendance` JOIN `class_session`
- **Date Parsing:** Convert natural language to date/date range
  - "Monday" → most recent Monday
  - "last week" → 7 days ago to today
  - "January" → January 1 to January 31 of current year
  - "15th January" → specific date
- **Return:** List of sessions with status for that period

**Schema Validation:**
- ✅ `class_session.date` supports date filtering
- ✅ Can query by date range

**Edge Cases:**
- Ambiguous "Monday" → which Monday? (default to most recent)
- Future dates → no sessions exist yet
- Holidays/weekends → sessions might not exist
- Multiple sessions per day → return all

---

### 1.4 Subject-Specific Attendance

**Parent Questions:**
23. "How is his attendance in Math?"
24. "Did he attend Science class today?"
25. "How many English classes has he missed?"
26. "What's his attendance percentage for Chemistry?"

**Database Requirements:**
- **Tables:** `attendance` JOIN `class_session` JOIN `classroom`
- **Challenge:** Need to identify subject from classroom.name
  - Example: classroom.name = "10th Grade Math" → extract "Math"
- **Return:** Attendance data filtered by subject/classroom

**Schema Validation:**
- ⚠️ **PROBLEM:** No explicit subject field in classroom table
- Current: classroom.name = "10th Grade Math" (subject embedded in name)
- Requires string parsing to extract subject

**Schema Enhancement RECOMMENDED:**
```sql
ALTER TABLE classroom ADD COLUMN subject VARCHAR(100);
-- Now can directly query: WHERE classroom.subject = 'Math'
```

**Edge Cases:**
- Multiple Math classes (Math A, Math B, Advanced Math)
- Subject name variations: "Math" vs "Mathematics" vs "Maths"
- Student enrolled in multiple sections of same subject

---

## CATEGORY 2: GRADE/PERFORMANCE QUERIES

### 2.1 Simple Grade Questions

**Parent Questions:**
27. "What did Arjun score in the Math quiz?"
28. "How did he do on the test?"
29. "What's his latest grade?"
30. "Did he pass the Science exam?"
31. "Show me his recent scores"

**Student Questions:**
32. "What did I get in Math?"
33. "What's my quiz score?"
34. "Did I pass?"
35. "Show my recent grades"

**Database Requirements:**
- **Tables:** `assignment_submission` JOIN `assignment`
- **Filters:** user_id (student), optional: assignment title match, classroom filter
- **Order:** submitted_at DESC for "recent"
- **Return:**
  - assignment.title
  - score
  - total
  - percentage
  - submitted_at

**Schema Validation:**
- ✅ Current schema supports this
- `assignment_submission` has score, total, percentage
- Can join to `assignment` for title

**Edge Cases:**
- "The test" → vague, which test? Return most recent or ask for clarification
- "Pass" → what's passing grade? Need threshold (typically 40% or 50%)
- No submissions yet → return "No grades recorded yet"

---

### 2.2 Subject Performance Questions

**Parent Questions:**
36. "How is Arjun doing in Math?"
37. "What's his grade in Science?"
38. "Is he doing well in English?"
39. "Show me all Math scores"
40. "What's his average in Chemistry?"
41. "How is his performance in Physics?"

**Student Questions:**
42. "How am I doing in Math?"
43. "What's my Science average?"
44. "Am I failing any subject?"

**Database Requirements:**
- **Tables:** `assignment_submission` JOIN `assignment` JOIN `classroom`
- **Filter:** user_id + classroom (identify subject)
- **Calculation:** AVG(assignment_submission.percentage) for subject
- **Return:**
  - average_percentage
  - recent_assignments (last 3-5)
  - trend (improving/declining/stable)
  - assignment count

**Schema Validation:**
- ⚠️ **SAME PROBLEM:** No explicit subject field
- Need to parse subject from classroom.name
- Formula: AVG(percentage) is correct per requirements

**Schema Enhancement RECOMMENDED:**
```sql
-- Add subject to assignment table for easier filtering
ALTER TABLE assignment ADD COLUMN subject VARCHAR(100);
```

**Edge Cases:**
- Subject name matching (Math vs Mathematics)
- No submissions for subject yet
- Student in multiple sections of same subject → aggregate across all
- Different assignment types (quiz vs exam) → all weighted equally?

---

### 2.3 Comparative Performance

**Parent Questions:**
45. "How is Arjun compared to class average?"
46. "Is he above average in Math?"
47. "Where does he rank in the class?"
48. "Is he doing better than last month?"
49. "How does his Math score compare to Science?"

**Student Questions:**
50. "Am I above class average?"
51. "How do I compare to others?"
52. "What's my rank?"

**Database Requirements:**
- **Tables:** `assignment_submission` for all students in same classroom
- **Calculations:**
  - Student average: AVG(percentage) WHERE user_id = student
  - Class average: AVG(percentage) WHERE classroom_id = X
  - Rank: COUNT(students with higher average) + 1
  - Percentile: (rank / total_students) * 100
- **Return:**
  - student_avg
  - class_avg
  - rank
  - percentile
  - total_students

**Schema Validation:**
- ✅ Schema supports this but requires complex query
- Need to query all students in `classroom_membership`
- Then aggregate their grades

**Edge Cases:**
- Class average for which timeframe? (all time vs this month)
- Privacy concerns → should students see full rankings?
- Tie-breaking → students with identical averages get same rank
- New students with few grades → rank may not be meaningful

**Potential Schema Enhancement:**
```sql
-- Materialized view for performance
CREATE MATERIALIZED VIEW classroom_rankings AS
SELECT 
  classroom_id,
  user_id,
  AVG(percentage) as avg_grade,
  RANK() OVER (PARTITION BY classroom_id ORDER BY AVG(percentage) DESC) as rank
FROM assignment_submission
GROUP BY classroom_id, user_id;
```

---

### 2.4 Trend Analysis

**Parent Questions:**
53. "Is Arjun improving?"
54. "Are his grades getting better?"
55. "Is he declining in Math?"
56. "Show me his progress over time"
57. "How has he performed this semester?"

**Database Requirements:**
- **Tables:** `assignment_submission` ordered by submitted_at
- **Calculation Logic:**
  - Split submissions into time periods (first half vs second half)
  - Calculate average for each period
  - Compare: if recent_avg > earlier_avg → improving
  - Or: linear regression over time
- **Return:**
  - trend: "improving", "declining", or "stable"
  - percentage_change
  - time_series_data (for graphing)

**Schema Validation:**
- ✅ Schema supports via submitted_at timestamp
- Can order by date and calculate trends

**Edge Cases:**
- Not enough data points (< 3 assignments) → "insufficient data"
- Inconsistent difficulty → 90% on easy quiz vs 70% on hard exam (trend may be misleading)
- Long gaps between assignments → trend less meaningful
- Different subjects have different pacing

---

### 2.5 Assignment-Specific Questions

**Parent Questions:**
58. "What did he get on the Math Quiz 1?"
59. "Did he submit the homework?"
60. "When is the next assignment due?"
61. "What assignments are pending?"
62. "Did he complete the Science project?"

**Student Questions:**
63. "Did I submit the homework?"
64. "What's due tomorrow?"
65. "What assignments do I have pending?"

**Database Requirements:**
- **For submitted assignments:**
  - Query: `assignment_submission` JOIN `assignment` WHERE title LIKE '%Quiz 1%'
  - Return: score, total, percentage

- **For pending assignments:**
  - Query: `assignment` WHERE due_date >= today 
    AND NOT EXISTS (SELECT 1 FROM assignment_submission WHERE user_id = X)
  - Return: List of unsubmitted assignments with due dates

- **For upcoming due dates:**
  - Query: `assignment` WHERE due_date BETWEEN today AND tomorrow
  - Return: Assignments due soon

**Schema Validation:**
- ✅ Schema supports submitted assignment queries
- ✅ Can identify pending by absence in assignment_submission
- ✅ due_date field exists in assignment table

**Edge Cases:**
- Fuzzy matching on assignment title ("Math Quiz 1" vs "Quiz 1 - Math")
- Multiple assignments with similar names
- Late submissions (submitted after due_date) → still counts as submitted
- Assignment not yet created in system → parent asking about something teacher mentioned verbally

**Potential Schema Enhancement:**
```sql
-- Add submission status tracking
ALTER TABLE assignment_submission ADD COLUMN submission_status VARCHAR(20) 
CHECK (submission_status IN ('on_time', 'late', 'excused'));

ALTER TABLE assignment_submission ADD COLUMN submitted_at_time TIMESTAMP;
-- Compare with assignment.due_date to determine if late
```

---

## CATEGORY 3: MULTIPLE CHILDREN QUERIES (Parent Only)

**Parent Questions:**
66. "How are both my children doing?"
67. "Show me Arjun's and Priya's attendance"
68. "Compare my kids' performance"
69. "Who is doing better, Arjun or Priya?"
70. "Show me all my children's grades"
71. "Which child needs more help?"

**Database Requirements:**
- **Tables:** `parent_student_link` JOIN `user` to get all linked children
- **Then:** Query attendance and grades for EACH child
- **Aggregation:** Combine data for comparison
- **Return:**
  - Per-child summary (name, attendance %, grade avg)
  - Comparison metrics
  - Identify child who needs attention

**Schema Validation:**
- ✅ `parent_student_link` supports multiple children per parent
- Can iterate through linked students and aggregate

**Edge Cases:**
- Parent mentions only one child when they have multiple → return data for mentioned child
- Children in different grades → comparison may not be apples-to-apples
- Children in different schools (different school_id) → need to handle cross-school queries
- One child has more data than other (started mid-year)

---

## CATEGORY 4: AMBIGUOUS/COMPLEX QUERIES

### 4.1 Vague Questions

**Parent Questions:**
72. "How is my son?"
73. "Is everything okay?"
74. "How's school?"
75. "Any updates?"
76. "What's new?"

**Database Requirements:**
- Need comprehensive summary combining:
  - Today's attendance (all classes)
  - Recent grades (last 3-5 assignments)
  - Upcoming assignments (due this week)
  - Overall attendance percentage
  - Overall grade average
  - Any notable changes (big grade drop, attendance drop)

**Schema Validation:**
- ✅ Schema supports all individual queries
- Requires multiple queries combined

**Response Strategy:**
- Provide holistic summary
- Prioritize most important information (recent attendance, recent grades)

**Edge Cases:**
- Parent has multiple children → ask which child or provide summary for all
- No recent activity → "Everything looks good, no updates since last check"

---

### 4.2 Multi-Subject Questions

**Parent Questions:**
77. "How is he doing in Math and Science?"
78. "Show me grades for all subjects"
79. "Which subject is he strongest in?"
80. "Which subject needs improvement?"
81. "Compare his Math, Science, and English performance"

**Database Requirements:**
- **Tables:** `assignment_submission` JOIN `assignment` JOIN `classroom`
- **Aggregation:** Group by subject, calculate average per subject
- **Comparison:** Rank subjects by performance
- **Return:**
  - Per-subject averages
  - Best subject (highest avg)
  - Weakest subject (lowest avg)
  - Comparison data

**Schema Validation:**
- ⚠️ **BLOCKED BY:** No explicit subject field (same issue as before)
- Would need to parse or add subject column

**Edge Cases:**
- Different number of assignments per subject (Math: 10 quizzes, Science: 3 exams)
- Should all assignments be weighted equally?
- New subject with only 1 grade → average may not be representative

---

### 4.3 Time-Based Complex Questions

**Parent Questions:**
82. "How did he do this week?"
83. "Show me January performance"
84. "What happened last month?"
85. "Compare this semester to last semester"
86. "How was Q1 vs Q2?"

**Database Requirements:**
- **Date Range Parsing:**
  - "this week" → Monday to today
  - "January" → Jan 1 to Jan 31
  - "last month" → first to last day of previous month
  - "Q1" → need academic calendar (when does Q1 start/end?)
  
- **Queries:** Both attendance and grades for time period
- **Return:** Aggregated metrics for requested period

**Schema Validation:**
- ✅ Timestamps allow date range filtering
- ⚠️ **MISSING:** Academic calendar metadata (semester dates, quarter dates)

**Potential Schema Enhancement:**
```sql
CREATE TABLE academic_calendar (
  id SERIAL PRIMARY KEY,
  school_id INTEGER REFERENCES classroom(school_id),
  period_type VARCHAR(20), -- 'semester', 'quarter', 'trimester'
  period_name VARCHAR(50), -- 'Q1', 'Semester 1', etc.
  start_date DATE,
  end_date DATE
);
```

**Edge Cases:**
- Different schools use different systems (semester vs quarter vs trimester)
- Summer breaks → no data for those months
- Mid-year transfers → student has data for only part of year

---

## CATEGORY 5: BEHAVIORAL/NON-ACADEMIC QUERIES

**Parent Questions:**
87. "Is Arjun behaving well?"
88. "Any discipline issues?"
89. "How is his participation?"
90. "Is he paying attention in class?"
91. "Any complaints from teachers?"

**Database Requirements:**
- ❌ **NOT SUPPORTED BY CURRENT SCHEMA**
- Would need new tables:

```sql
CREATE TABLE behavior_log (
  id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES user(id),
  teacher_id INTEGER REFERENCES user(id),
  classroom_id INTEGER REFERENCES classroom(id),
  date DATE,
  behavior_type VARCHAR(50), -- 'positive', 'concern', 'discipline'
  description TEXT,
  created_at TIMESTAMP
);

CREATE TABLE teacher_notes (
  id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES user(id),
  teacher_id INTEGER REFERENCES user(id),
  note_type VARCHAR(50), -- 'participation', 'behavior', 'progress'
  note_text TEXT,
  created_at TIMESTAMP
);
```

**Current Handling:**
- Classify as "Support/General" intent
- Escalate to teacher
- Or provide canned response: "For behavioral concerns, please contact the teacher directly."

---

## CATEGORY 6: ADMINISTRATIVE QUERIES

**Parent Questions:**
92. "When is the next parent-teacher meeting?"
93. "When are exams scheduled?"
94. "When is the school holiday?"
95. "What's the fee payment deadline?"
96. "How do I access the report card?"
97. "When does school start/end?"
98. "What's the school address?"

**Database Requirements:**
- ❌ **NOT SUPPORTED BY CURRENT SCHEMA**
- Would need additional tables:

```sql
CREATE TABLE school_events (
  id SERIAL PRIMARY KEY,
  school_id INTEGER,
  event_type VARCHAR(50), -- 'meeting', 'exam', 'holiday', 'assembly'
  event_name VARCHAR(255),
  event_date DATE,
  start_time TIME,
  end_time TIME,
  description TEXT
);

CREATE TABLE fee_records (
  id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES user(id),
  amount DECIMAL(10,2),
  due_date DATE,
  status VARCHAR(20) -- 'pending', 'paid', 'overdue'
);
```

**Current Handling:**
- Classify as "Support/General"
- Provide canned responses for common questions
- Or escalate to school office

---

## CATEGORY 7: EDGE CASE SCENARIOS

### 7.1 Name Ambiguity

**Questions:**
99. "How is Arjun?" (parent has 2 kids both named Arjun in different grades)
100. "Show me Math grades" (student enrolled in Math A and Math B)
101. "What did I get?" (which assignment? which subject?)

**Resolution Strategy:**
- Check `parent_student_link` → if multiple students with same name, ask: "You have two children named Arjun in Grade 5 and Grade 8. Which one?"
- For multiple classrooms: Ask "You're enrolled in Math A and Math B. Which one?"
- For vague "what did I get": Return most recent or ask "Which assignment?"

**Database Support:**
- ✅ Schema allows multiple students with same name (different IDs)
- Need disambiguation logic in application layer

---

### 7.2 Misspellings & Typos

**Questions:**
102. "How is Arjn doing?" (Arjun misspelled)
103. "Whts his attendnce?" (What's his attendance)
104. "Shw me grdes" (Show me grades)

**Resolution Strategy:**
- Use fuzzy string matching (Levenshtein distance) for student names
- LLM (Gemini) can handle typos in natural language
- Example: "Arjn" → search for similar names → "Did you mean Arjun?"

**Implementation:**
- Fuzzy matching on `user.username` when exact match fails
- Threshold: Levenshtein distance <= 2

---

### 7.3 Language Mix (India-Specific)

**Questions:**
105. "Arjun ka attendance kya hai?" (Hindi: What is Arjun's attendance?)
106. "Math mein kitne marks mile?" (Hindi: How many marks in Math?)
107. "Beta pass hua ya nahi?" (Hindi: Did child pass or not?)

**Resolution Strategy:**
- ⚠️ **NOT IN SCOPE FOR MVP** but future enhancement
- Gemini supports multilingual input
- Would need to handle Hindi-English code-switching

**Implementation Note:**
- For Phase 1: English only
- For Phase 2: Add multilingual support via Gemini's language detection

---

### 7.4 Incomplete/Unclear Questions

**Questions:**
108. "Yesterday?" (what about yesterday?)
109. "Math?" (what about Math?)
110. "Good or bad?" (what aspect?)
111. "???" (complete confusion)

**Resolution Strategy:**
- AI should ask clarifying question
- "I'd be happy to help! Are you asking about attendance, grades, or something else for yesterday?"
- Provide options if possible

---

### 7.5 Out-of-Scope Questions

**Questions:**
112. "What's the weather today?"
113. "Tell me a joke"
114. "Who is the principal?"
115. "How do I make biryani?"
116. "What time does school start?"

**Resolution Strategy:**
- Politely redirect: "I can help with attendance, grades, and academic information. For other questions, please contact the school office or check the school website."
- Don't attempt to answer unrelated questions

---

## DATABASE SCHEMA GAPS SUMMARY

### ✅ WELL-SUPPORTED (No Changes Needed)

1. **Simple Attendance Queries** - status, date filtering ✅
2. **Attendance Percentage** - calculation formula supported ✅
3. **Simple Grade Queries** - scores, percentages ✅
4. **Average Grade Calculation** - AVG(percentage) ✅
5. **Date Range Queries** - timestamps support filtering ✅
6. **Multiple Children** - parent_student_link supports this ✅
7. **Pending Assignments** - can identify via LEFT JOIN ✅

### ⚠️ PARTIALLY SUPPORTED (Workarounds Needed)

1. **Subject-Specific Queries** - No explicit subject field
   - Workaround: Parse classroom.name
   - Better: Add classroom.subject column

2. **Class Averages / Rankings** - Requires complex aggregation
   - Workaround: Calculate on-demand
   - Better: Add materialized view

3. **Trend Analysis** - Requires time-series analysis
   - Workaround: Calculate in application layer
   - Better: Add analytics views

### ❌ NOT SUPPORTED (New Tables Required)

1. **Behavioral/Participation Tracking**
   - Need: behavior_log table
   - Need: teacher_notes table

2. **Administrative Info**
   - Need: school_events table
   - Need: fee_records table
   - Need: academic_calendar table

3. **Assignment Submission Status**
   - Need: submission_status field (on_time vs late)

---

## RECOMMENDED SCHEMA ENHANCEMENTS

### Priority 1: CRITICAL for MVP

**Enhancement 1: Add Explicit Subject Fields**
```sql
-- Makes subject-based queries much easier
ALTER TABLE classroom ADD COLUMN subject VARCHAR(100);
ALTER TABLE assignment ADD COLUMN subject VARCHAR(100);

-- Update existing data
UPDATE classroom SET subject = 
  CASE 
    WHEN name LIKE '%Math%' THEN 'Mathematics'
    WHEN name LIKE '%Science%' THEN 'Science'
    WHEN name LIKE '%English%' THEN 'English'
    -- etc.
  END;
```

**Benefit:** Eliminates need for string parsing, enables reliable subject filtering

---

**Enhancement 2: Add Assignment Submission Status**
```sql
ALTER TABLE assignment_submission ADD COLUMN submission_status VARCHAR(20) 
  CHECK (submission_status IN ('on_time', 'late', 'excused'));

-- Auto-calculate on insert/update
CREATE TRIGGER set_submission_status
BEFORE INSERT ON assignment_submission
FOR EACH ROW
EXECUTE FUNCTION calculate_submission_status();
```

**Benefit:** Can distinguish on-time vs late submissions

---

**Enhancement 3: Add Indexes for Performance**
```sql
-- Speed up common queries
CREATE INDEX idx_attendance_student_date ON attendance(student_id, session_id);
CREATE INDEX idx_assignment_sub_user ON assignment_submission(user_id, assignment_id);
CREATE INDEX idx_session_date ON class_session(date);
CREATE INDEX idx_assignment_due ON assignment(due_date);
CREATE INDEX idx_classroom_subject ON classroom(subject); -- after adding column
```

**Benefit:** Faster query performance, especially as data grows

---

### Priority 2: NICE TO HAVE

**Enhancement 4: Academic Calendar Table**
```sql
CREATE TABLE academic_periods (
  id SERIAL PRIMARY KEY,
  school_id INTEGER,
  period_type VARCHAR(20), -- 'quarter', 'semester', 'term'
  period_name VARCHAR(50), -- 'Q1', 'Semester 1'
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  UNIQUE(school_id, period_name)
);
```

**Benefit:** Enables semester/quarter comparisons

---

**Enhancement 5: Materialized Views for Performance**
```sql
-- Pre-calculate student summaries
CREATE MATERIALIZED VIEW student_performance_summary AS
SELECT 
  user_id as student_id,
  classroom.subject,
  COUNT(DISTINCT assignment_submission.id) as total_assignments,
  AVG(assignment_submission.percentage) as average_grade,
  MIN(assignment_submission.percentage) as lowest_grade,
  MAX(assignment_submission.percentage) as highest_grade
FROM assignment_submission
JOIN assignment ON assignment.id = assignment_submission.assignment_id
JOIN classroom ON classroom.id = assignment.classroom_id
GROUP BY user_id, classroom.subject;

-- Refresh nightly or after grade entry
REFRESH MATERIALIZED VIEW student_performance_summary;
```

**Benefit:** Much faster queries for "How is student doing in Math?"

---

### Priority 3: FUTURE ENHANCEMENTS

**Enhancement 6: Behavioral Tracking** (if needed later)
```sql
CREATE TABLE teacher_notes (
  id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES user(id),
  teacher_id INTEGER REFERENCES user(id),
  classroom_id INTEGER REFERENCES classroom(id),
  note_type VARCHAR(50), -- 'participation', 'behavior', 'progress', 'concern'
  note_text TEXT,
  is_positive BOOLEAN, -- true for praise, false for concern
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

**Enhancement 7: School Events** (if needed later)
```sql
CREATE TABLE school_events (
  id SERIAL PRIMARY KEY,
  school_id INTEGER,
  event_type VARCHAR(50), -- 'exam', 'meeting', 'holiday', 'assembly'
  event_name VARCHAR(255),
  event_date DATE,
  start_time TIME,
  end_time TIME,
  description TEXT,
  target_audience VARCHAR(50), -- 'all', 'grade_10', 'parents'
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## INTENT CLASSIFICATION MATRIX

Use this to train intent detection:

| Question Pattern | Intent | Database Tables Needed |
|-----------------|--------|------------------------|
| "Was [student] present?" | academic_info | attendance, class_session |
| "What's [student]'s attendance?" | academic_info | attendance, class_session |
| "How is [student] doing in [subject]?" | result_info | assignment_submission, assignment, classroom |
| "What did [student] score?" | result_info | assignment_submission, assignment |
| "Show me grades" | result_info | assignment_submission, assignment |
| "Is [student] improving?" | result_info | assignment_submission (time-series) |
| "Compare [student] to class" | result_info | assignment_submission (aggregate) |
| "What's due tomorrow?" | result_info | assignment |
| "How is [student] behaving?" | support_general | ❌ Not supported (escalate) |
| "When is parent meeting?" | support_general | ❌ Not supported (canned response) |
| Vague/"How is my son?" | support_general | Multiple tables (comprehensive summary) |

---

## ENTITY EXTRACTION REQUIREMENTS

For each question, extract these entities:

**Required:**
- **student_identifier**: Name, ID, or relationship ("my son", "my child", "Arjun")

**Optional (context-dependent):**
- **subject**: Math, Science, English, etc.
- **time_period**: today, this week, January, last month, Q1, etc.
- **metric_type**: attendance, grade, percentage, average, rank
- **assignment_name**: "Math Quiz 1", "homework", "Science project"
- **comparison_target**: class average, sibling, previous period

**Examples:**

```
Question: "How is Arjun doing in Math this month?"
Entities:
  - student: "Arjun"
  - subject: "Math"
  - time_period: "this month"
  - metric: "performance" (general)

Question: "Was my son present yesterday?"
Entities:
  - student: "my son" (resolve via parent_id)
  - time_period: "yesterday"
  - metric: "attendance"

Question: "What did Priya score on Quiz 1?"
Entities:
  - student: "Priya"
  - assignment: "Quiz 1"
  - metric: "grade"
```

---

## TEST DATASET RECOMMENDATIONS

Create test data that covers:

**Student Profiles:**
1. High performer (95%+ grades, 100% attendance)
2. Average performer (75-85% grades, 90% attendance)
3. Struggling student (50-60% grades, 70% attendance)
4. New student (only 2-3 grades, limited history)
5. Multiple subjects student (grades in Math, Science, English)

**Time Periods:**
- Some assignments from 3 months ago
- Some from 1 month ago
- Some from last week
- Some from yesterday
- Some due tomorrow (pending)

**Edge Cases:**
- Student with no submissions for one subject
- Student who joined mid-semester
- Parent with 3 children
- Identical twin names (Arjun A, Arjun B)

**Question Test Suite:**
Create 100 test questions covering:
- 30 attendance queries (simple, percentage, date-specific, subject-specific)
- 40 grade queries (simple, subject, comparative, trend, pending)
- 10 multi-child queries
- 10 ambiguous/vague queries
- 10 edge cases (typos, unclear, out of scope)

---

## VALIDATION CHECKLIST

Before finalizing schema, verify:

- [ ] Can answer "Was [student] present today?" ✅
- [ ] Can calculate attendance percentage correctly ✅
- [ ] Can answer "What did [student] score in Math?" ⚠️ (needs subject field)
- [ ] Can calculate subject-specific averages ⚠️ (needs subject field)
- [ ] Can compare student to class average ✅ (complex query)
- [ ] Can identify pending assignments ✅
- [ ] Can show trend (improving/declining) ✅ (application logic)
- [ ] Can handle multiple children per parent ✅
- [ ] Can filter by date ranges ✅
- [ ] Has indexes for performance ⚠️ (need to add)

**Critical Blockers:**
- ❌ No explicit subject field → **MUST ADD**
- ❌ No submission status tracking → **SHOULD ADD**

---

END OF DOCUMENT
