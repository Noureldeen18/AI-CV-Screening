import { GoogleGenAI, Type, Modality } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface JobProfile {
  id: string;
  title: string;
  field: string;
  experience: string;
  skills: string;
  other: string;
  createdAt?: number;
}

export interface CandidateResult {
  id: string;
  profileId: string;
  fileName: string;
  candidateName: string;
  score: number;
  keyStrengths: string[];
  summary: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  error?: string;
}

export async function screenCV(file: File, profile: JobProfile, lang: 'ar' | 'en' = 'ar'): Promise<Partial<CandidateResult>> {
  const base64 = await fileToBase64(file);
  const mimeType = file.type;

  const langText = lang === 'ar' ? 'العربية' : 'English';
  
  const prompt = `
    أنت خبير موارد بشرية (HR). قم بتقييم السيرة الذاتية المرفقة بناءً على الملف الوظيفي التالي:
    المسمى الوظيفي: ${profile.title}
    المجال: ${profile.field}
    الخبرة المطلوبة: ${profile.experience}
    المهارات المطلوبة: ${profile.skills}
    متطلبات أخرى: ${profile.other}

    المطلوب:
    1. استخراج اسم المرشح.
    2. إعطاء تقييم (score) من 0 إلى 100 بناءً على مدى مطابقة المرشح للملف الوظيفي.
    3. ذكر 3 إلى 5 نقاط قوة رئيسية للمرشح.
    4. كتابة ملخص قصير (جملتين أو ثلاث) يوضح مدى ملاءمة المرشح.
    
    يجب أن تكون الإجابة باللغة ${langText}.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: [
      {
        parts: [
          { text: prompt },
          { inlineData: { data: base64.split(',')[1], mimeType } }
        ]
      }
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          candidateName: { type: Type.STRING, description: "اسم المرشح" },
          score: { type: Type.NUMBER, description: "التقييم من 0 إلى 100" },
          keyStrengths: { type: Type.ARRAY, items: { type: Type.STRING }, description: "نقاط القوة" },
          summary: { type: Type.STRING, description: "ملخص الملاءمة" }
        },
        required: ['candidateName', 'score', 'keyStrengths', 'summary']
      }
    }
  });

  if (!response.text) throw new Error('No response from Gemini');
  return JSON.parse(response.text);
}

export async function suggestProfile(title: string, lang: 'ar' | 'en' = 'ar') {
  const langText = lang === 'ar' ? 'العربية' : 'English';
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `ما هي المتطلبات والمهارات والخبرات النموذجية لوظيفة "${title}"؟ يرجى الرد باللغة ${langText} وإرجاع كائن JSON يحتوي على الحقول التالية: 'field' (المجال)، 'experience' (الخبرة)، 'skills' (المهارات)، 'other' (متطلبات أخرى).`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          field: { type: Type.STRING },
          experience: { type: Type.STRING },
          skills: { type: Type.STRING },
          other: { type: Type.STRING }
        }
      }
    }
  });
  if (!response.text) throw new Error('No response from Gemini');
  return JSON.parse(response.text);
}

export async function generateAudioSummary(text: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-preview-tts',
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Zephyr' }
        }
      }
    }
  });
  
  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error('No audio generated');
  return base64Audio;
}

export async function playPCM(base64Data: string) {
  const binaryString = window.atob(base64Data);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const sampleRate = 24000;
  const numChannels = 1;
  const audioBuffer = audioContext.createBuffer(numChannels, bytes.length / 2, sampleRate);
  const channelData = audioBuffer.getChannelData(0);
  
  const dataView = new DataView(bytes.buffer);
  for (let i = 0; i < bytes.length / 2; i++) {
    channelData[i] = dataView.getInt16(i * 2, true) / 32768;
  }
  
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioContext.destination);
  source.start();
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
}
