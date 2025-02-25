// File: app/api/python-bridge/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { once } from 'events';

let pythonProcess: any = null;

async function startPythonProcess() {
  if (pythonProcess === null) {
    pythonProcess = spawn('python', ['lib/translation_server.py']);
    
    // Handle process startup separately
    pythonProcess.stdout.once('data', () => {
      console.log('Python server started');
    });

    pythonProcess.stderr.on('data', (data: Buffer) => {
      console.error('Python stderr:', data.toString());
    });

    pythonProcess.on('close', (code: number) => {
      console.log(`Python process exited with code ${code}`);
      pythonProcess = null;
    });

    // Wait for server to be ready
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, text, targetLanguage, historicalContext } = body;

    if (!action) {
      return NextResponse.json({ error: 'Missing action' }, { status: 400 });
    }

    const huggingFaceToken = process.env.HUGGING_FACE_TOKEN;
    if (!huggingFaceToken) {
      return NextResponse.json(
        { error: 'Hugging Face token not found' },
        { status: 500 }
      );
    }

    await startPythonProcess();

    if (action === 'translate') {
      if (!text || !targetLanguage) {
        return NextResponse.json(
          { error: 'Missing required fields for translation' },
          { status: 400 }
        );
      }

      // Send translation request
      pythonProcess.stdin.write(
        `translate|${text}|${targetLanguage}|${huggingFaceToken}|${
          historicalContext || ''
        }\n`
      );

      // Wait for and parse response
      try {
        const [stdout] = await once(pythonProcess.stdout, 'data');
        const responseText = stdout.toString().trim();
        
        try {
          const result = JSON.parse(responseText);
          if (result.error) {
            console.error('Python error:', result.error);
            return NextResponse.json({ error: result.error }, { status: 500 });
          }
          return NextResponse.json(result);
        } catch (parseError) {
          console.error('Failed to parse Python response:', responseText);
          return NextResponse.json(
            { error: 'Invalid response from translation server' },
            { status: 500 }
          );
        }
      } catch (error) {
        console.error('Error reading Python response:', error);
        return NextResponse.json(
          { error: 'Failed to get translation response' },
          { status: 500 }
        );
      }
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Operation error:', error);
    return NextResponse.json({ error: 'Operation failed' }, { status: 500 });
  }
}