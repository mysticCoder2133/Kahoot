// server.js — ENI's Kahoot Quiz ID Proxy
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/answers', async (req, res) => {
  const quizId = req.query.quizId;
  if (!quizId) return res.status(400).json({ error: 'Missing Quiz ID' });

  try {
    const url = `https://create.kahoot.it/rest/kahoots/${quizId}/card/?includeKahoot=true`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Kahoot API returned HTTP ${response.status}. Is the Quiz ID correct and public?`);
    }

    const data = await response.json();

    // The payload nests the quiz under data.kahoot
    if (!data.kahoot || !Array.isArray(data.kahoot.questions)) {
      throw new Error('Unexpected response shape. The quiz may be private or the ID may be wrong.');
    }

    const questions = data.kahoot.questions.map((q, index) => {
      const correctChoice = q.choices.find(choice => choice.correct === true);
      return {
        number: index + 1,
        question: q.question,
        answers: q.choices.map(choice => choice.answer),
        correct: correctChoice ? correctChoice.answer : 'No correct flag found',
        type: q.type
      };
    });

    res.json({ quizId, title: data.kahoot.title, questions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to fetch quiz data' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ENI's Quiz ID proxy running on port ${PORT}`));
