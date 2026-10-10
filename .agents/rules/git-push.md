# Git Push Rule

Whenever any modification, addition, or bugfix is made to the WaySafe project:
1. Ensure all sensitive files (`.env`, secrets) remain untracked and ignored by `.gitignore`.
2. Run relevant tests to ensure project stability.
3. Stage all modified and created files:
   ```bash
   git add .
   ```
4. Create a meaningful commit:
   ```bash
   git commit -m "<concise description of changes>"
   ```
5. Push immediately to the remote GitHub repository:
   ```bash
   git push origin main
   ```
