import { Router } from "express";
import bcrypt from "bcrypt";
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
  if (!user || !user.isActive) {
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
  newPassword: z.string().min(8)
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
