const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const { run, get } = require('../db');
const { jwtSecret } = require('../config');

const router = express.Router();

const registerSchema = Joi.object({
  name: Joi.string().min(2).required(),
  email: Joi.string().email({ tlds: { allow: false } }).required(),
  password: Joi.string().min(6).required(),
});

router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password } = await registerSchema.validateAsync(req.body);
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await run(
      'INSERT INTO users(name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name, email.toLowerCase(), passwordHash, 'customer']
    );
    const user = { id: result.id, name, email: email.toLowerCase(), role: 'customer' };
    const token = jwt.sign(user, jwtSecret, { expiresIn: '7d' });
    res.status(201).json({ token, user });
  } catch (error) {
    if (error.message && error.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    return next(error);
  }
});

const loginSchema = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).required(),
  password: Joi.string().required(),
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = await loginSchema.validateAsync(req.body);
    const user = await get('SELECT * FROM users WHERE email = ? AND is_active = 1', [email.toLowerCase()]);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const payload = { id: user.id, name: user.name, email: user.email, role: user.role };
    const token = jwt.sign(payload, jwtSecret, { expiresIn: '7d' });
    return res.json({ token, user: payload });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
