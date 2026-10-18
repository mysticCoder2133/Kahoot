// server.js — ENI's Kahoot Answer Proxy
const express = require('express');
const cors = require('cors');
const Kahoot = require('kahoot.js-latest');

const app = express();
app.use(cors());
app.use(express.json());

const sessionCache = new Map();

app.get('/api/answers', async (req, res) => {
  const pin = req.query.pin;
  if (!pin) return res.status(400).json({ error: 'Missing Game PIN' });

  if (sessionCache.has(pin)) {
    const cached = sessionCache.get(pin);
    if (Date.now() - cached.timestamp < 600_000) {
      return res.json(cached.data);
    }
  }

  try {
    const answers = await scrapeKahoot(pin);
    sessionCache.set(pin, { data: answers, timestamp: Date.now() });
    res.json(answers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to scrape Kahoot' });
  }
});

function scrapeKahoot(pin) {
  return new Promise((resolve, reject) => {
    const client = new Kahoot();
    const questions = [];
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try { client.leave(); } catch (e) {}
        reject(new Error('Timeout: no questions received. Is the PIN active?'));
      }
    }, 90_000);

    const adjectives = ['Happy', 'Clever', 'Brave', 'Sunny', 'Quiet', 'Swift', 'Calm', 'Bright'];
    const nouns = ['Bear', 'Lion', 'Fox', 'Owl', 'Wolf', 'Hawk', 'Deer', 'Seal'];
    const botName = adjectives[Math.floor(Math.random() * adjectives.length)] +
                    nouns[Math.floor(Math.random() * nouns.length)];

    // Single join call. No duplicates.
    client.join(pin, botName)
      .then((joinResult) => {
        console.log('✅ Join call resolved. Raw result:', JSON.stringify(joinResult, null, 2));
        if (joinResult && joinResult.twoFactor) {
          console.log('🔐 Two-factor challenge REQUIRED. Bot is stuck at the checkpoint.');
        }
      })
      .catch((err) => {
        console.error('❌ Join rejected:', err && err.message ? err.message : err);
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(new Error(`Join failed: ${err && err.message ? err.message : err}`));
        }
      });

    client.on('Joined', () => {
      console.log(`✅ Joined game ${pin} as "${botName}".`);
    });

    client.on('QuizStart', () => {
      console.log('🏁 QuizStart fired — host launched the quiz.');
    });

    client.on('QuestionReady', (data) => {
      console.log('👀 QuestionReady fired:', JSON.stringify(data));
    });

    client.on('QuestionStart', (question) => {
      console.log('📥 QuestionStart fired. Keys:', Object.keys(question || {}));
      console.log('   Raw question object:', JSON.stringify(question, null, 2));

      if (question && question.question && !questions.some(q => q.question === question.question)) {
        questions.push({
          question: question.question,
          answers: question.answers,
          correct: question.correctAnswers,
          type: question.type
        });
      }
    });

    client.on('QuizEnd', () => {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        try { client.leave(); } catch (e) {}
        resolve({ pin, questions });
      }
    });

    client.on('Disconnect', (reason) => {
      console.log('🔌 Disconnected from Kahoot:', reason);
    });

    client.on('error', (err) => {
      console.error('⚠️ Client error:', err && err.message ? err.message : err);
    });
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ENI's Kahoot proxy running on port ${PORT}`));
