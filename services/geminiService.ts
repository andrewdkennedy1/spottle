
import { GoogleGenAI, Type } from "@google/genai";
import { Track } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function parsePlaylistData(input: string | { data: string, mimeType: string }): Promise<{ name: string, tracks: Track[] }> {
  const isUrl = typeof input === 'string' && (input.includes('spotify.com') || input.includes('http'));
  // Use pro model for search grounding if it's a link
  const model = isUrl ? "gemini-3-pro-preview" : "gemini-3-flash-preview";
  
  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: "Suggested name for the playlist" },
      tracks: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            artist: { type: Type.STRING },
            album: { type: Type.STRING },
          },
          required: ["title", "artist"]
        }
      }
    },
    required: ["name", "tracks"]
  };

  const systemInstruction = `
    You are a music metadata expert. 
    Analyze the provided input (text, image, or a URL to a music playlist).
    If a URL is provided, use Google Search to fetch the playlist content and metadata.
    Extract a clean list of songs. 
    Remove extra markers like "(Remastered)", "feat.", or track numbers from the title if they aren't essential.
    Identify the main artist and the album if possible.
    If the input is an image, perform OCR first and then structure the data.
    Return JSON format.
  `;

  let contents;
  if (typeof input === 'string') {
    contents = input;
  } else {
    contents = {
      parts: [
        { text: "Extract all song tracks from this image." },
        { inlineData: input }
      ]
    };
  }

  const result = await ai.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema,
      tools: isUrl ? [{ googleSearch: {} }] : undefined
    }
  });

  const parsed = JSON.parse(result.text || "{}");
  
  return {
    name: parsed.name || "My Migrated Playlist",
    tracks: (parsed.tracks || []).map((t: any, index: number) => ({
      ...t,
      id: `track-${index}`,
      status: 'pending'
    }))
  };
}

export async function verifyAppleMusicMatch(track: Track): Promise<{ confidence: number, matchFound: boolean }> {
  const model = "gemini-3-flash-preview";
  const result = await ai.models.generateContent({
    model,
    contents: `Verify if this song likely exists on Apple Music: "${track.title}" by ${track.artist} from album ${track.album}. Respond with a JSON object { "confidence": number, "exists": boolean }. Confidence is 0 to 1.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          confidence: { type: Type.NUMBER },
          exists: { type: Type.BOOLEAN }
        },
        required: ["confidence", "exists"]
      }
    }
  });
  
  const parsed = JSON.parse(result.text || '{"confidence": 0, "exists": false}');
  return { confidence: parsed.confidence, matchFound: parsed.exists };
}
