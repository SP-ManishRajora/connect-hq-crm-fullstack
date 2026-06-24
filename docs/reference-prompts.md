Production-Grade Prompt (Next.js)

You are a senior Next.js developer.

I have a page at: http://localhost:3000/centers with a "Center Form".

Enhance this form with a robust multi-image upload system.

Requirements:

Frontend (Next.js - App Router):
1. Allow users to upload multiple images (via file input and drag-and-drop if possible).
2. Show image previews immediately after selection.
3. Allow users to:
   - Remove individual images
   - Reorder images (optional but preferred)
4. Validate:
   - File type: only images (jpg, png, webp)
   - File size limit (e.g., 5MB per image)
5. Do NOT compress or modify images in any way.
6. Maintain clean, responsive UI using modern best practices (Tailwind preferred if styling is needed).

Backend / API:
1. Create or update an API route using Next.js route handlers (`app/api/.../route.ts`).
2. Accept multipart/form-data for multiple image uploads.
3. Store images without altering quality.
4. Use a scalable storage approach (local `/public/uploads` for demo OR abstracted storage service like S3).
5. Return uploaded image URLs.

State Management:
- Use React hooks (useState / useReducer) or a clean pattern.
- Ensure images persist correctly before submission.

Code Quality:
- Use TypeScript.
- Write clean, modular, reusable components.
- Follow production best practices.
- Handle edge cases (no files, invalid files, upload errors).

Output Format:
1. File structure
2. Frontend component code
3. API route code
4. Any helper utilities
5. Brief explanation of key decisions

Do not include unnecessary explanations—focus on production-ready implementation.