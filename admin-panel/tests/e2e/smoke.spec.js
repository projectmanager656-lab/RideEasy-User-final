import { test, expect } from '@playwright/test';

test('home or landing loads', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
});

test('login page reachable', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('body')).toBeVisible();
});

test('user signup page loads', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.locator('body')).toBeVisible();
});

test('captain login page loads', async ({ page }) => {
    await page.goto('/captain-login');
    await expect(page.locator('body')).toBeVisible();
});

test('captain signup page loads', async ({ page }) => {
    await page.goto('/captain-signup');
    await expect(page.locator('body')).toBeVisible();
});

test('admin login page loads', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.locator('body')).toBeVisible();
});
