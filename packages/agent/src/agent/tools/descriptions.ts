/**
 * Tool descriptions shown to the LLM. THESE carry the routing logic — the
 * LLM picks tools based on these strings, not on tool names. Keep each
 * description focused on "pick this tool WHEN", and explicitly call out
 * adjacent tools to disambiguate.
 */

export const descriptions = {
  get_attendance_today:
    "Use when the parent asks about attendance for today only — e.g. 'is he at school', 'did Arjun come today', 'was he marked present today'. Do NOT use for 'this month' or percentage questions.",

  get_attendance_summary:
    "Use for attendance percentage, total days missed, or attendance over a date range. Optional `from`/`to` let you scope to 'this week', 'last month', etc. — parse the parent's phrase into YYYY-MM-DD dates. Use get_attendance_today instead for 'today'.",

  get_attendance_by_date_range:
    "Use when the parent wants a per-day list of attendance within a range — e.g. 'what was his attendance last week', 'show me January attendance'. Returns each session with its status. For an aggregate percentage only, use get_attendance_summary.",

  get_recent_grades:
    "Use for 'what did he score recently', 'show me his latest grades', 'his last few marks'. Returns the most recent submissions across all subjects.",

  get_subject_performance:
    "Use when the parent names a specific subject — e.g. 'how is he in Math', 'his Science average', 'is he doing well in English'. Pass the subject string as written. For 'best/weakest subject' or cross-subject comparisons use get_all_subjects_performance.",

  get_all_subjects_performance:
    "Use for 'best subject', 'weakest subject', 'which subject needs improvement', or 'show grades for all subjects'. Returns per-subject averages ordered best-to-worst.",

  get_class_comparison:
    "Use for rank / class-average questions — 'where does he stand in class', 'is he above average', 'top of the class'. `subject` is optional; if omitted compares overall.",

  get_grade_trend:
    "Use for 'is he improving', 'getting better/worse', 'progress over time'. Optional subject narrows to one subject. Returns direction (improving/declining/stable/insufficient_data).",

  find_submissions_by_title:
    "Use when the parent names a specific assignment title — e.g. 'Math Quiz 1', 'the science project'. Pass a substring of the title as `titlePattern`.",

  get_upcoming_assignments:
    "Use for 'what's due tomorrow', 'any homework due this week', 'upcoming tests'. `days` defaults to 7.",

  get_pending_assignments:
    "Use for 'any pending work', 'what's he not submitted', 'is anything overdue'. Returns unsubmitted assignments including overdue ones by default.",

  get_student_overview:
    "Use for vague, catch-all questions with no specific metric — 'how is my son', 'any updates', 'how is school going', 'is everything okay'. Returns attendance + recent grades + best/weakest subject + upcoming work in one shot. Do NOT use if the parent named a specific subject or metric.",

  get_children_summary:
    "Use ONLY when a parent has 2+ linked children and asks about all of them — 'how are both my kids', 'compare my children', 'which child needs help'. Do not use for a single child; resolve the child and use get_student_overview instead.",

  list_my_linked_children:
    "Use ONLY if the sender is a parent with 2+ linked children AND they did NOT name a specific child. Call this first to get the list, then reply asking the parent which child they mean. If the parent named a child, you already have the answer via context — do not call this.",

  generate_performance_report:
    "Use when the parent asks for a downloadable / printable / shareable report — phrasings like 'send me the report', 'give me a PDF', 'full performance summary', 'progress card', 'detailed report'. Generates a PDF covering attendance + quiz + marks + subject averages, uploads it, and returns a public URL. Include the URL verbatim in your reply so the parent can tap it. Do NOT use for casual questions answered by the read-only tools.",
} as const;

export type ToolName = keyof typeof descriptions;
