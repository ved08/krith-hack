import PDFDocument from "pdfkit";
import type { QuizAnalysis } from "./quizzes.js";

/**
 * Simple single-page quiz report PDF. Uploaded to Supabase after
 * scoring and linked in the parent WhatsApp notification.
 */

const NAVY = "#0F1C3F";
const ACCENT = "#D4A82C";
const INK = "#1F2937";
const MUTED = "#475569";

export type QuizReportInput = {
  studentName: string;
  quizTitle: string;
  subject: string;
  topic: string;
  difficulty: string;
  score: number;
  maxScore: number;
  percentage: number;
  analysis: QuizAnalysis;
  submittedAtIso: string;
};

export function buildQuizReportPdf(input: QuizReportInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const chunks: Buffer[] = [];
      doc.on("data", (c) => chunks.push(c as Buffer));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // Header band
      doc.rect(0, 0, doc.page.width, 8).fill(ACCENT);
      doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(10).text(
        "CAMPUS CORTEX · QUIZ REPORT",
        50,
        25,
      );

      // Title
      doc.moveDown(1.5);
      doc.fontSize(20).fillColor(INK).text(input.quizTitle, { align: "left" });
      doc
        .fontSize(10)
        .fillColor(MUTED)
        .text(`${input.subject} · ${input.topic} · ${input.difficulty}`, { align: "left" });

      doc.moveDown(0.5);
      doc
        .fontSize(11)
        .fillColor(INK)
        .font("Helvetica")
        .text(`Student: ${input.studentName}`)
        .text(`Submitted: ${new Date(input.submittedAtIso).toLocaleString()}`);

      // Score band
      doc.moveDown(1);
      const y = doc.y;
      doc
        .rect(50, y, doc.page.width - 100, 60)
        .lineWidth(1)
        .strokeColor(NAVY)
        .stroke();
      doc
        .font("Helvetica-Bold")
        .fontSize(28)
        .fillColor(NAVY)
        .text(
          `${input.score} / ${input.maxScore}`,
          60,
          y + 12,
          { width: doc.page.width - 120, align: "center" },
        );
      doc
        .font("Helvetica")
        .fontSize(12)
        .fillColor(MUTED)
        .text(`${input.percentage.toFixed(1)}%`, 60, y + 42, {
          width: doc.page.width - 120,
          align: "center",
        });
      doc.y = y + 80;

      // Summary
      writeSection(doc, "Summary", [input.analysis.summary]);
      writeSection(doc, "Strengths", input.analysis.strengths);
      writeSection(doc, "Areas to grow", input.analysis.growthAreas);
      writeSection(doc, "Recommended next steps", input.analysis.recommendedActions);

      // Per-question feedback
      doc.moveDown(0.5);
      doc
        .font("Helvetica-Bold")
        .fontSize(12)
        .fillColor(NAVY)
        .text("Per-question feedback");
      doc.moveDown(0.3);
      for (const sq of input.analysis.scoredQuestions) {
        doc
          .font("Helvetica-Bold")
          .fontSize(10)
          .fillColor(INK)
          .text(`${sq.questionId} · ${sq.correct ? "✓" : "✗"} ${sq.awardedPoints} pts`);
        doc
          .font("Helvetica")
          .fontSize(10)
          .fillColor(MUTED)
          .text(sq.feedback);
        doc.moveDown(0.4);
      }

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

function writeSection(doc: PDFKit.PDFDocument, title: string, lines: string[]) {
  if (!lines.length) return;
  doc.moveDown(0.6);
  doc.font("Helvetica-Bold").fontSize(12).fillColor(NAVY).text(title);
  doc.moveDown(0.2);
  doc.font("Helvetica").fontSize(10).fillColor(INK);
  for (const l of lines) {
    doc.text(`• ${l}`, { indent: 4 });
  }
}
