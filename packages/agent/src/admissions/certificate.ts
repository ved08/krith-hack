import PDFDocument from "pdfkit";
import type { AdmissionProfile, LearningDnaAnalysis } from "./phase2.js";

/**
 * Builds the two-page Learning DNA certificate:
 *   Page 1 — landscape certificate (student name, completion line, seal)
 *   Page 2 — portrait detail report (summary, strengths, growth, actions)
 *
 * Colour palette approximates the provided reference:
 *   navy   #0F1C3F   — headlines, borders, signatures
 *   yellow #FFCE00   — left-side decorative block
 *   gold   #D4A82C   — medal/seal
 *   red    #D94C2E   — seal ribbons
 */

const NAVY = "#0F1C3F";
const YELLOW = "#FFCE00";
const GOLD = "#D4A82C";
const GOLD_DARK = "#A6811E";
const RED = "#D94C2E";
const INK = "#1F2937";
const MUTED = "#475569";

export type CertificateInput = {
  studentName: string;
  parentName: string;
  schoolName?: string;
  currentClass: string;
  overallScore: number;
  readinessBand: string;
  summary: string;
  strengths: string[];
  growthAreas: string[];
  recommendedActions: string[];
  certificateHeadline: string;
  evaluationId: string;
  evaluatedAtIso: string;
};

export function buildCertificatePdf(input: CertificateInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        layout: "landscape",
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        info: {
          Title: `Learning DNA — ${input.studentName}`,
          Author: "Campus Cortex AI",
          Subject: "Admissions Learning DNA Certificate",
        },
      });

      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      drawCertificatePage(doc, input);
      doc.addPage({ size: "A4", layout: "portrait", margins: { top: 48, bottom: 48, left: 56, right: 56 } });
      drawReportPage(doc, input);

      doc.end();
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

// ─── Page 1: Certificate ─────────────────────────────────────────────────

function drawCertificatePage(doc: PDFKit.PDFDocument, input: CertificateInput) {
  const W = doc.page.width;
  const H = doc.page.height;

  // Left decorative band: yellow with navy polygonal accent.
  doc.save();
  doc.rect(0, 0, 120, H).fill(YELLOW);
  doc.polygon([120, 0], [120, H * 0.55], [60, H])
    .fillOpacity(0.15)
    .fill(NAVY);
  doc.fillOpacity(1);
  doc.restore();

  // Right decorative strip: navy with yellow accent line.
  doc.save();
  doc.rect(W - 60, 0, 60, H).fill(NAVY);
  doc.rect(W - 78, 10, 4, H - 20).fill(YELLOW);
  doc.restore();

  // Bottom-right wedge — navy triangle for depth.
  doc.save();
  doc.polygon([W - 60, H], [W - 60, H - 180], [W - 260, H])
    .fillOpacity(0.95)
    .fill(NAVY);
  doc.fillOpacity(1);
  doc.restore();

  // Main white card (offset so decorative edges peek through).
  doc.save();
  doc
    .roundedRect(80, 60, W - 200, H - 120, 4)
    .fillAndStroke("#FFFFFF", "#E2E8F0");
  doc.restore();

  // Gold seal top-right of card with ribbons.
  drawSeal(doc, W - 180, 130);

  // Title
  doc
    .fillColor(NAVY)
    .font("Helvetica-Bold")
    .fontSize(40)
    .text("CERTIFICATE OF LEARNING", 80, 140, { align: "center", width: W - 200, characterSpacing: 1 });

  // Sub-intro
  doc
    .fillColor(NAVY)
    .font("Helvetica")
    .fontSize(14)
    .text("This program certificate is proudly awarded to", 80, 210, {
      align: "center",
      width: W - 200,
    });

  // Student name — big, with underline
  const nameY = 265;
  doc
    .fillColor(NAVY)
    .font("Helvetica-Bold")
    .fontSize(44)
    .text(input.studentName.toUpperCase(), 80, nameY, {
      align: "center",
      width: W - 200,
      characterSpacing: 0.5,
    });
  // Underline under name
  const ulY = nameY + 62;
  doc
    .strokeColor(NAVY)
    .lineWidth(1.5)
    .moveTo(W * 0.28, ulY)
    .lineTo(W * 0.72, ulY)
    .stroke();

  // Completion line
  doc
    .fillColor(NAVY)
    .font("Helvetica")
    .fontSize(13)
    .text(
      `for completing the admissions assessment at Campus Cortex AI — ${input.currentClass}.`,
      80,
      ulY + 20,
      { align: "center", width: W - 200 },
    );

  // Key stats strip
  const statsY = ulY + 70;
  drawStats(
    doc,
    statsY,
    [
      { label: "Overall Score", value: `${input.overallScore}/100` },
      { label: "Readiness", value: input.readinessBand },
      { label: "Assessment ID", value: input.evaluationId.slice(0, 8) },
    ],
    W,
  );

  // Signature blocks
  const sigY = H - 140;
  doc
    .fillColor(NAVY)
    .font("Helvetica")
    .fontSize(14)
    .text("Avery Davis", 140, sigY, { width: 220 });
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("PRINCIPAL", 140, sigY + 22, { width: 220, characterSpacing: 1.5 });

  doc
    .font("Helvetica")
    .fontSize(14)
    .text("Reese Miller", W - 360, sigY, { width: 220, align: "right" });
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("CHAIRMAN", W - 360, sigY + 22, {
      width: 220,
      align: "right",
      characterSpacing: 1.5,
    });

  // Footer metadata
  doc
    .fillColor(MUTED)
    .font("Helvetica")
    .fontSize(8)
    .text(
      `Issued ${formatDate(input.evaluatedAtIso)} · Evaluation ${input.evaluationId}`,
      80,
      H - 80,
      { align: "center", width: W - 200 },
    );
}

function drawSeal(doc: PDFKit.PDFDocument, cx: number, cy: number) {
  const r = 36;
  // Ribbons
  doc
    .save()
    .polygon([cx - 12, cy + r - 4], [cx - 12, cy + r + 40], [cx - 2, cy + r + 32])
    .fill(RED);
  doc
    .polygon([cx + 12, cy + r - 4], [cx + 12, cy + r + 40], [cx + 2, cy + r + 32])
    .fill(RED);
  doc.restore();

  // Outer ring
  doc.save();
  doc.circle(cx, cy, r).fillAndStroke(GOLD, GOLD_DARK);
  doc
    .circle(cx, cy, r - 6)
    .lineWidth(1)
    .stroke(GOLD_DARK);
  // Star-ish glyph in middle (Unicode ★ is fine in Helvetica)
  doc
    .fillColor(NAVY)
    .font("Helvetica-Bold")
    .fontSize(18)
    .text("★", cx - 7, cy - 10);
  doc.restore();
}

function drawStats(
  doc: PDFKit.PDFDocument,
  y: number,
  items: Array<{ label: string; value: string }>,
  W: number,
) {
  const blockW = (W - 260) / items.length;
  items.forEach((it, idx) => {
    const x = 130 + blockW * idx;
    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(9)
      .text(it.label.toUpperCase(), x, y, {
        width: blockW,
        align: "center",
        characterSpacing: 1.5,
      });
    doc
      .fillColor(NAVY)
      .font("Helvetica-Bold")
      .fontSize(16)
      .text(it.value, x, y + 14, { width: blockW, align: "center" });
  });
}

// ─── Page 2: Detail report ────────────────────────────────────────────────

function drawReportPage(doc: PDFKit.PDFDocument, input: CertificateInput) {
  // Header band
  doc.save();
  doc.rect(0, 0, doc.page.width, 90).fill(NAVY);
  doc.restore();

  doc
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(20)
    .text("Learning DNA Report", 56, 30);
  doc
    .fillColor("#C7CFE5")
    .font("Helvetica")
    .fontSize(11)
    .text(`${input.studentName} · ${input.currentClass}`, 56, 56);

  // Back to white canvas
  doc.fillColor(INK).moveDown(4);

  // Metadata row
  doc
    .fontSize(10)
    .fillColor(MUTED)
    .text(
      `Evaluated ${formatDate(input.evaluatedAtIso)}   ·   Overall ${input.overallScore}/100   ·   Readiness: ${input.readinessBand}`,
      56,
      110,
    );

  doc.moveTo(56, 132).lineTo(doc.page.width - 56, 132).strokeColor("#E2E8F0").stroke();

  // Certificate headline as quote
  doc
    .fillColor(NAVY)
    .font("Helvetica-Bold")
    .fontSize(15)
    .text(input.certificateHeadline, 56, 148, {
      width: doc.page.width - 112,
    });

  // Summary
  section(doc, "Summary");
  paragraph(doc, input.summary);

  // Strengths
  section(doc, "Strengths");
  bulletList(doc, input.strengths);

  // Growth areas
  section(doc, "Growth areas");
  bulletList(doc, input.growthAreas);

  // Recommended actions
  section(doc, "Recommended actions");
  numberedList(doc, input.recommendedActions);

  // Footer
  const footerY = doc.page.height - 48;
  doc
    .fillColor(MUTED)
    .font("Helvetica")
    .fontSize(8)
    .text(
      `Generated by Campus Cortex AI · Evaluation ${input.evaluationId}`,
      56,
      footerY,
      { width: doc.page.width - 112, align: "center" },
    );
}

function section(doc: PDFKit.PDFDocument, title: string) {
  doc.moveDown(0.8);
  doc
    .fillColor(NAVY)
    .font("Helvetica-Bold")
    .fontSize(12)
    .text(title.toUpperCase(), { characterSpacing: 1.5 });
  doc.moveDown(0.2);
}

function paragraph(doc: PDFKit.PDFDocument, text: string) {
  doc
    .fillColor(INK)
    .font("Helvetica")
    .fontSize(11)
    .text(text, { align: "left", lineGap: 2 });
}

function bulletList(doc: PDFKit.PDFDocument, items: string[]) {
  for (const it of items) {
    doc
      .fillColor(INK)
      .font("Helvetica")
      .fontSize(11)
      .text(`•  ${it}`, { indent: 6, lineGap: 2 });
  }
}

function numberedList(doc: PDFKit.PDFDocument, items: string[]) {
  items.forEach((it, i) => {
    doc
      .fillColor(INK)
      .font("Helvetica")
      .fontSize(11)
      .text(`${i + 1}.  ${it}`, { indent: 6, lineGap: 2 });
  });
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
