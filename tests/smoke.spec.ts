import { test, expect } from '@playwright/test';

test.describe('prompt-to-video', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display initial landing page with header, heading and input', async ({ page }) => {
    // Verify header with StoryGen AI heading
    await expect(page.getByRole('heading', { name: 'StoryGen AI' })).toBeVisible();
    
    // Verify main heading text (partial match since it's "Turn any prompt into a")
    await expect(page.getByText('Turn any prompt into a').first()).toBeVisible();
    
    // Verify input placeholder
    await expect(page.getByPlaceholder('e.g. A cyberpunk neon city during a crimson rainstorm...')).toBeVisible();
    
    // Verify Generate Story button is visible and initially disabled
    const generateBtn = page.getByRole('button', { name: 'Generate Story', exact: true });
    await expect(generateBtn).toBeVisible();
    await expect(generateBtn).toBeDisabled();
  });

  test('should enable Generate button when prompt is entered', async ({ page }) => {
    const textarea = page.getByPlaceholder('e.g. A cyberpunk neon city during a crimson rainstorm...');
    await textarea.fill('cyberpunk city');
    
    const generateBtn = page.getByRole('button', { name: 'Generate Story', exact: true });
    await expect(generateBtn).toBeEnabled();
  });

  test('should generate story and display results after clicking Generate', async ({ page }) => {
    const textarea = page.getByPlaceholder('e.g. A cyberpunk neon city during a crimson rainstorm...');
    await textarea.fill('cyberpunk city');
    
    const generateBtn = page.getByRole('button', { name: 'Generate Story', exact: true });
    await generateBtn.click();
    
    // Wait for loading state
    await expect(page.getByText('Generating...').first()).toBeVisible();
    
    // Wait for loading to complete - verify loading disappears
    await expect(page.getByText('Generating...').first()).not.toBeVisible({ timeout: 30000 });
    
    // Verify Scene Script heading appears in the script panel
    await expect(page.getByText('Scene Script').first()).toBeVisible();
    
    // Verify character names appear in the script (using first() since they appear multiple times)
    await expect(page.getByText('Narrator').first()).toBeVisible();
    await expect(page.getByText('Kaelen').first()).toBeVisible();
    await expect(page.getByText('Lyra').first()).toBeVisible();
    await expect(page.getByText('The Watcher').first()).toBeVisible();
  });

  test('should show Reset button in header after generation', async ({ page }) => {
    const textarea = page.getByPlaceholder('e.g. A cyberpunk neon city during a crimson rainstorm...');
    await textarea.fill('cyberpunk city');
    
    const generateBtn = page.getByRole('button', { name: 'Generate Story', exact: true });
    await generateBtn.click();
    
    // Wait for generation to complete
    await expect(page.getByText('Generating...').first()).not.toBeVisible({ timeout: 30000 });
    
    // Verify Reset button appears in header
    const resetBtn = page.getByRole('button', { name: 'Reset', exact: true });
    await expect(resetBtn).toBeVisible();
  });

  test('should display image placeholder when image generation fails', async ({ page }) => {
    const textarea = page.getByPlaceholder('e.g. A cyberpunk neon city during a crimson rainstorm...');
    await textarea.fill('cyberpunk city');
    
    const generateBtn = page.getByRole('button', { name: 'Generate Story', exact: true });
    await generateBtn.click();
    
    // Wait for loading to complete
    await expect(page.getByText('Generating...').first()).not.toBeVisible({ timeout: 30000 });
    
    // Verify the placeholder image appears with Image Placeholder text
    // The app falls back to SVG placeholder when API fails
    await expect(page.getByText('Image Placeholder').first()).toBeVisible();
  });

  test('should reset application state when Reset button is clicked', async ({ page }) => {
    const textarea = page.getByPlaceholder('e.g. A cyberpunk neon city during a crimson rainstorm...');
    await textarea.fill('cyberpunk city');
    
    const generateBtn = page.getByRole('button', { name: 'Generate Story', exact: true });
    await generateBtn.click();
    
    // Wait for generation to complete
    await expect(page.getByText('Generating...').first()).not.toBeVisible({ timeout: 30000 });
    
    // Click Reset button
    const resetBtn = page.getByRole('button', { name: 'Reset', exact: true });
    await resetBtn.click();
    
    // Verify we're back to initial state - landing page elements should be visible
    await expect(page.getByRole('heading', { name: 'StoryGen AI' })).toBeVisible();
    await expect(page.getByText('Turn any prompt into a').first()).toBeVisible();
    await expect(page.getByPlaceholder('e.g. A cyberpunk neon city during a crimson rainstorm...')).toBeVisible();
    
    // Verify Generate button is disabled again (prompt was cleared)
    await expect(page.getByRole('button', { name: 'Generate Story', exact: true })).toBeDisabled();
  });

  test('should regenerate story with new prompt', async ({ page }) => {
    // First generation
    const textarea = page.getByPlaceholder('e.g. A cyberpunk neon city during a crimson rainstorm...');
    await textarea.fill('fantasy kingdom');
    
    const generateBtn = page.getByRole('button', { name: 'Generate Story', exact: true });
    await generateBtn.click();
    
    // Wait for first generation to complete
    await expect(page.getByText('Generating...').first()).not.toBeVisible({ timeout: 30000 });
    
    // Verify first story content is present
    await expect(page.getByText('Narrator').first()).toBeVisible();
    
    // Enter new prompt and generate again (re-generation flow)
    await textarea.fill('space exploration');
    await generateBtn.click();
    
    // Wait for second generation
    await expect(page.getByText('Generating...').first()).not.toBeVisible({ timeout: 30000 });
    
    // Verify new story content appears
    await expect(page.getByText('Narrator').first()).toBeVisible();
  });

  test('should display play button after generation completes', async ({ page }) => {
    const textarea = page.getByPlaceholder('e.g. A cyberpunk neon city during a crimson rainstorm...');
    await textarea.fill('cyberpunk city');
    
    const generateBtn = page.getByRole('button', { name: 'Generate Story', exact: true });
    await generateBtn.click();
    
    // Wait for generation to complete
    await expect(page.getByText('Generating...').first()).not.toBeVisible({ timeout: 30000 });
    
    // Verify Ready to play button is visible in playback controls
    const playBtn = page.getByRole('button', { name: 'Ready to play', exact: true });
    await expect(playBtn).toBeVisible();
  });

  test('should render correctly on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    
    // Verify header is still visible on mobile
    await expect(page.getByRole('heading', { name: 'StoryGen AI' })).toBeVisible();
    
    // Verify main heading
    await expect(page.getByText('Turn any prompt into a').first()).toBeVisible();
    
    // Verify input and button are accessible on mobile
    const textarea = page.getByPlaceholder('e.g. A cyberpunk neon city during a crimson rainstorm...');
    await expect(textarea).toBeVisible();
    
    await textarea.fill('cyberpunk city');
    
    const generateBtn = page.getByRole('button', { name: 'Generate Story', exact: true });
    await expect(generateBtn).toBeVisible();
    await expect(generateBtn).toBeEnabled();
  });
});