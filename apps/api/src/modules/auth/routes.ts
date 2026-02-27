import { Router } from "express";
import bcrypt from "bcrypt";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { AuthRequest, requireAuth, signToken } from "../../utils/auth.js";

export const authRouter = Router();

const loginSchema = z.object({
  loginName: z.string().min(1),
  password: z.string().min(1)
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Ungueltige Eingaben." });
    return;
  }

  const user = await prisma.user.findUnique({ where: { loginName: parsed.data.loginName } });
  if (!user || !user.isActive || !user.webLoginEnabled) {
    res.status(401).json({ message: "Login fehlgeschlagen." });
    return;
  }

  const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ message: "Login fehlgeschlagen." });
    return;
  }

  const token = signToken({ userId: user.id, role: user.role });
  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      loginName: user.loginName
    }
  });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(8, "Passwort muss mindestens 8 Zeichen lang sein.")
    .regex(/^(?=.*([0-9]|[^A-Za-z0-9])).+$/, "Passwort braucht mindestens eine Zahl oder ein Sonderzeichen.")
});

authRouter.post("/change-password", requireAuth, async (req: AuthRequest, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success || !req.auth) {
    res.status(400).json({ message: "Ungueltige Eingaben." });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: req.auth.userId } });
  if (!user) {
    res.status(404).json({ message: "Benutzer nicht gefunden." });
    return;
  }

  const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!valid) {
    res.status(400).json({ message: "Aktuelles Passwort ist falsch." });
    return;
  }

  const hash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash } });

  res.json({ message: "Passwort geaendert." });
});

const resetSchema = z.object({
  loginName: z.string().min(1),
  newPassword: z.string().min(8)
});

const qrLoginSchema = z.object({
  token: z.string().min(16)
});

authRouter.post("/reset-password", async (req, res) => {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Ungueltige Eingaben." });
    return;
  }

  const user = await prisma.user.findUnique({ where: { loginName: parsed.data.loginName } });
  if (!user) {
    res.status(404).json({ message: "Benutzer nicht gefunden." });
    return;
  }

  const hash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash } });

  res.json({ message: "Passwort zurueckgesetzt." });
});

authRouter.post("/login-qr", async (req, res) => {
  const parsed = qrLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Ungueltige Eingaben." });
    return;
  }
  const tokenHash = crypto.createHash("sha256").update(parsed.data.token).digest("hex");
  const now = new Date();
  const user = await prisma.user.findFirst({
    where: {
      mobileQrTokenHash: tokenHash,
      mobileQrEnabled: true,
      OR: [{ mobileQrExpiresAt: null }, { mobileQrExpiresAt: { gt: now } }]
    }
  });
  if (!user || !user.isActive || !user.webLoginEnabled) {
    res.status(401).json({ message: "QR-Login fehlgeschlagen." });
    return;
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { mobileQrLastUsedAt: now }
  });
  const token = signToken({ userId: user.id, role: user.role });
  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      loginName: user.loginName
    }
  });
});
