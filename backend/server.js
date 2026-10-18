// server.js — ENI's Kahoot Answer Proxy
const express = require('express');
const cors = require('cors');
const Kahoot = require('@venixthedev/kahootjs');

const app = express();
app.use(cors());
app.use(express.json());

// In-memory cache for recent sessions (optional)
const sessionCache = new Map();

app.get('/api/answers', async (req, res) => {
  const pin = req.query.pin;
  if (!pin) return res.status(400).json({ error: 'Missing Game PIN' });

  // If we already scraped this PIN in the last 10 minutes, return cached
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

    // Timeout if no questions arrive within 60s
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        client.leave();
        reject(new Error('Timeout: no questions received. Is the PIN active?'));
      }
    }, 90_000);

    client.join(pin, `Alex${Math.floor(Math.random() * 900 + 100)}`);

client.on('Joined', () => {
  console.log(`✅ Joined game ${pin} successfully.`);
});

client.on('QuestionStart', (question) => {
  console.log('📥 QuestionStart fired:', question.question);
  questions.push({
    question: question.question,
    answers: question.answers,
    correct: question.correctAnswers,
    type: question.type
  });
});

client.on('QuizEnd', () => {
  clearTimeout(timeout);
  if (!resolved) {
    resolved = true;
    client.leave();
    resolve({ pin, questions });
  }
});

// Optional: if the library emits an error event, catch it here.
// If not, the timeout remains your safety net.
if (typeof client.on === 'function') {
  client.on('error', (err) => {
    clearTimeout(timeout);
    if (!resolved) {
      resolved = true;
      reject(new Error(`Join failed: ${err.message || err}`));
    }
  });
}
    
    client.on('question', (question) => {
      console.log('📥 Received question data via "question" event:', question.question);
      if (!questions.some(q => q.question === question.question)) {
        questions.push({
          question: question.question,
          answers: question.answers,
          correct: question.correctAnswers,
          type: question.type
        });
      }
    });
    
    client.on('questionStart', (question) => {
      // kahoot.js-updated exposes question object with .answers, .correctAnswers etc.
      const answerData = {
        question: question.question,
        answers: question.answers,
        correct: question.correctAnswers, // array of indices or labels
        type: question.type
      };
      questions.push(answerData);
    });

    client.on('quiz_end', () => {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        client.leave();
        resolve({ pin, questions });
      }
    });

    // Some versions emit 'question' instead of 'question_start'
    client.on('question', (question) => {
      // handle similarly if needed
    });

    // If the host only shows one question and ends, we still need to capture it
    // The quiz_end handler will fire.
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ENI's Kahoot proxy running on port ${PORT}`));
