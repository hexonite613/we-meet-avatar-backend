const express = require('express');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');

// .env 파일 로드
const envPath = path.join(__dirname, '.env');
console.log('Loading .env file from:', envPath);
const result = dotenv.config({ path: envPath });

if (result.error) {
    console.error('Error loading .env file:', result.error);
} else {
    console.log('Environment variables loaded:', {
        SPEECH_KEY: process.env.SPEECH_KEY ? '***' : 'missing',
        SPEECH_REGION: process.env.SPEECH_REGION,
        voice: process.env.voice,
        GPT_ENDPOINT: process.env.GPT_ENDPOINT,
        GPT_KEY: process.env.GPT_KEY ? '***' : 'missing'
    });
    
    // 모든 환경 변수 출력 (디버깅용)
    console.log('All environment variables:');
    Object.keys(process.env).forEach(key => {
        if (key.includes('GPT') || key.includes('OPENAI') || key.includes('AZURE')) {
            console.log(`${key}: ${process.env[key] ? '***' : 'missing'}`);
        }
    });
}

const app = express();
//3000 포트로 설정
const port = 3000;

// CORS 설정
app.use(cors());
app.use(express.json());  // JSON 요청 본문 파싱
app.use(express.urlencoded({ extended: true }));  // URL 인코딩된 요청 본문 파싱

// 정적 파일 제공 설정
app.use(express.static(path.join(__dirname, '../frontend')));

// API 엔드포인트
app.get('/api/config', (req, res) => {
    const config = {
        SPEECH_KEY: process.env.SPEECH_KEY,
        SPEECH_REGION: process.env.SPEECH_REGION,
        voice: process.env.voice
    };
    console.log('Sending config:', {
        ...config,
        SPEECH_KEY: config.SPEECH_KEY ? '***' : 'missing'
    });
    res.json(config);
});

// 기본 라우트
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

// Azure Speech 설정 제공
app.get('/api/speech-config', (req, res) => {
    try {
        console.log('Speech 설정 요청 받음');
        if (!process.env.SPEECH_KEY || !process.env.SPEECH_REGION) {
            throw new Error('Speech 서비스 설정이 누락되었습니다.');
        }

        const config = {
            speechKey: process.env.SPEECH_KEY,
            speechRegion: process.env.SPEECH_REGION,
            language: 'ko-KR',
            voiceName: 'ko-KR-SunHiNeural'
        };

        console.log('Speech 설정 전송:', config);
        res.json(config);
    } catch (error) {
        console.error('Speech 설정 오류:', error);
        res.status(500).json({ error: error.message });
    }
});

// GPT API 엔드포인트
app.post('/api/gpt', async (req, res) => {
    try {
        const { text } = req.body;
        const endpoint = process.env.gpt_endpoint;
        const apiKey = process.env.gpt_key;
        const deployment = "gpt-4";

        // 환경 변수 로깅
        console.log('GPT API 설정:');
        console.log('ENDPOINT:', endpoint);
        console.log('API KEY:', apiKey ? '***' : 'missing');
        console.log('DEPLOYMENT:', deployment);
        console.log('요청 텍스트:', text);

        // 스트리밍 응답 설정
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const response = await fetch(`${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=2023-05-15`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': apiKey
            },
            body: JSON.stringify({
                messages: [
                    {
                        role: "system",
                        content: `너는 AZ-900 자격증 취득을 위해 도움을 주기 위한 도우미이야. 사용자가 이와 비슷한 발음의 말을 하면 AZ-900이라 생각하고 대답하거나 아예 다른 질문을 하면 대답해서는 안되고 공부 욕구를 증진시켜주는 말을 해줘. 특수 문자나 이모티콘은 쓰면 안돼.`
                    },
                    { role: "user", content: text }
                ],
                max_tokens: 800,
                stream: true
            })
        });

        // 스트림 처리
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') {
                        res.write('data: [DONE]\n\n');
                        break;
                    }
                    try {
                        const parsed = JSON.parse(data);
                        const content = parsed.choices[0]?.delta?.content;
                        if (content) {
                            res.write(`data: ${JSON.stringify({ content })}\n\n`);
                        }
                    } catch (e) {
                        console.error('Error parsing chunk:', e);
                    }
                }
            }
        }

        res.end();
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});