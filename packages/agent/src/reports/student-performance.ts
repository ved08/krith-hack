import PDFDocument from "pdfkit";
import type { StudentDetail } from "../db/queries/dashboard.js";

/**
 * Single-page A4 student performance report.
 *
 * Pulls everything `getStudentDetail` returns (attendance summary,
 * quiz scores, assignment marks, subject averages) into one printable
 * snapshot a parent can share or archive.
 *
 * Visual style mirrors the quiz report: navy header band, gold accent,
 * sectioned bullet copy. No charts — Gemini-style narrative + tables
 * keeps the PDF small and readable on a phone.
 */

const NAVY = "#0F1C3F";
const ACCENT = "#D4A82C";
const INK = "#1F2937";
const MUTED = "#475569";
const PRESENT = "#10b981";
const LATE = "#f59e0b";
const ABSENT = "#ef4444";

export type PerformanceReportInput = {
  detail: StudentDetail;
  schoolName: string;
  generatedAtIso: string;
};

export function buildStudentPerformancePdf(
  input: PerformanceReportInput,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const chunks: Buffer[] = [];
      doc.on("data", (c) => chunks.push(c as Buffer));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // Header band
      doc.rect(0, 0, doc.page.width, 8).fill(ACCENT);
      doc
        .fillColor(NAVY)
        .font("Helvetica-Bold")
        .fontSize(10)
        .text("CAMPUS CORTEX · PERFORMANCE REPORT", 50, 25);

      // Identity block
      doc.moveDown(1.5);
      doc.fontSize(22).fillColor(INK).text(input.detail.student.fullName);
      doc
        .fontSize(10)
        .fillColor(MUTED)
        .text(input.schoolName)
        .text(
          `Classes: ${input.detail.classrooms
            .map((c) => `${c.subject} (${c.grade})`)
            .join(", ") || "—"}`,
        )
        .text(`Generated: ${new Date(input.generatedAtIso).toLocaleString()}`);

      // Attendance block
      writeSectionTitle(doc, "Attendance · last 30 days");
      const att = input.detail.attendance;
      const totalMarked = input.detail.attendance.last30Days.filter(
        (d) => d.status,
      ).length;
      doc.font("Helvetica").fontSize(10).fillColor(INK);
      doc.text(
        `Sessions tracked: ${totalMarked}    ` +
          `Present: ${att.presentPct.toFixed(1)}%    ` +
          `Late: ${att.latePct.toFixed(1)}%    ` +
          `Absent: ${att.absentPct.toFixed(1)}%`,
      );
      drawAttendanceStrip(doc, input.detail.attendance.last30Days);

      // Subject averages
      writeSectionTitle(doc, "Subject averages");
      if (input.detail.subjectBreakdown.length === 0) {
        doc
          .font("Helvetica-Oblique")
          .fontSize(10)
          .fillColor(MUTED)
          .text("No graded work yet.");
      } else {
        doc.font("Helvetica").fontSize(10).fillColor(INK);
        for (const s of input.detail.subjectBreakdown) {
          doc.text(
            `${s.subject.padEnd(18)} ${s.avgPercentage.toFixed(1)}%   (${s.count} item${s.count === 1 ? "" : "s"})`,
          );
        }
      }

      // Recent quiz submissions
      writeSectionTitle(doc, "Recent quiz submissions");
      if (input.detail.quizResults.length === 0) {
        doc
          .font("Helvetica-Oblique")
          .fontSize(10)
          .fillColor(MUTED)
          .text("None on record.");
      } else {
        doc.font("Helvetica").fontSize(10).fillColor(INK);
        for (const q of input.detail.quizResults.slice(-5)) {
          doc.text(
            `• ${q.quizTitle} (${q.subject}, ${q.difficulty}) — ${q.score}/${q.maxScore} · ${q.percentage.toFixed(1)}%   ${new Date(q.submittedAt).toLocaleDateString()}`,
          );
        }
      }

      // Recent assignment marks
      writeSectionTitle(doc, "Recent marks");
      if (input.detail.assignmentResults.length === 0) {
        doc
          .font("Helvetica-Oblique")
          .fontSize(10)
          .fillColor(MUTED)
          .text("None on record.");
      } else {
        doc.font("Helvetica").fontSize(10).fillColor(INK);
        for (const a of input.detail.assignmentResults.slice(-5)) {
          doc.text(
            `• ${a.title} (${a.subject}, ${a.type}) — ${a.score}/${a.maxScore} · ${a.percentage.toFixed(1)}%   ${new Date(a.submittedAt).toLocaleDateString()}`,
          );
        }
      }

      // Footer
      doc
        .fontSize(8)
        .fillColor(MUTED)
        .text(
          "Generated automatically by Campus Cortex AI based on the school's records at the time of generation.",
          50,
          doc.page.height - 60,
          { width: doc.page.width - 100, align: "center" },
        );

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

function writeSectionTitle(doc: PDFKit.PDFDocument, title: string) {
  doc.moveDown(0.8);
  doc.font("Helvetica-Bold").fontSize(12).fillColor(NAVY).text(title);
  doc.moveDown(0.2);
}

/**
 * Tiny coloured-square strip showing per-day status for the last 30
 * sessions. One square per session — green/amber/red/grey.
 */
function drawAttendanceStrip(
  doc: PDFKit.PDFDocument,
  days: Array<{ date: string; status: "PRESENT" | "ABSENT" | "LATE" | null }>,
) {
  if (days.length === 0) return;
  const x0 = doc.x;
  const y0 = doc.y + 6;
  const size = 8;
  const gap = 2;
  // Dedupe by date — when the student is in multiple classrooms the
  // same date can appear several times. Prefer any marked status.
  const byDate = new Map<string, "PRESENT" | "ABSENT" | "LATE" | null>();
  for (const d of days) {
    const prior = byDate.get(d.date);
    if (prior === undefined || (!prior && d.status)) byDate.set(d.date, d.status);
  }
  const sorted = [...byDate.entries()].sort((a, b) =>
    a[0] < b[0] ? -1 : 1,
  );
  let x = x0;
  for (const [, status] of sorted) {
    const fill =
      status === "PRESENT"
        ? PRESENT
        : status === "LATE"
        ? LATE
        : status === "ABSENT"
        ? ABSENT
        : "#e2e8f0";
    doc.rect(x, y0, size, size).fill(fill);
    x += size + gap;
  }
  doc.fillColor(INK);
  doc.y = y0 + size + 6;
}
