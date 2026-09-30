import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HelpCenterView } from './HelpCenterView';

describe('HelpCenterView React Component DOM & Smoke Tests', () => {
  it('mounts cleanly and renders hero banner, title, version, and search input', () => {
    render(<HelpCenterView />);

    expect(screen.getByText('TwoTab Knowledge Center')).toBeDefined();
    expect(screen.getAllByText(/v1\.14\.0/i).length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText(/search guides, tools, shortcuts/i)).toBeDefined();
  });

  it('renders all 7 category filter pills', () => {
    render(<HelpCenterView />);

    expect(screen.getByRole('button', { name: /All Topics/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Getting Started/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Tab Organization/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Power Tools Hub/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Performance & Dormant Tabs/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Backups & 100% Privacy/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Troubleshooting & FAQ/i })).toBeDefined();
  });

  it('renders the 4 Core Workflows overview cards on initial mount', () => {
    render(<HelpCenterView />);

    expect(screen.getByText('Core Workflows at a Glance')).toBeDefined();
    expect(screen.getAllByText('1-Click Window Capture').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Tab Group Inspector').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Power Tools Hub').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Zero-Bandwidth Restoration').length).toBeGreaterThan(0);
  });

  it('filters guides when clicking the "Power Tools Hub" category pill', () => {
    render(<HelpCenterView />);

    const powerToolsPill = screen.getByRole('button', { name: /Power Tools Hub/i });
    fireEvent.click(powerToolsPill);

    // Should display all 4 power tools
    expect(screen.getByText('Link Health & Dead Link Inspector')).toBeDefined();
    expect(screen.getByText('Smart Duplicate & Mirror Cleaner')).toBeDefined();
    expect(screen.getByText('Domain Sorter & Library Organizer')).toBeDefined();
    expect(screen.getByText('Stale Tabs & Aging Purifier')).toBeDefined();
  });

  it('filters content live when typing in the search input', () => {
    render(<HelpCenterView />);

    const searchInput = screen.getByPlaceholderText(/search guides, tools, shortcuts/i);
    fireEvent.change(searchInput, { target: { value: 'dead links' } });

    expect(screen.getByText(/matching result/i)).toBeDefined();
    expect(screen.getByText('Link Health & Dead Link Inspector')).toBeDefined();
    // Non-matching guides should not be found
    expect(screen.queryByText('Domain Sorter & Library Organizer')).toBeNull();
  });

  it('displays empty state when search returns zero results, and clears search upon clicking button', () => {
    render(<HelpCenterView />);

    const searchInput = screen.getByPlaceholderText(/search guides, tools, shortcuts/i);
    fireEvent.change(searchInput, { target: { value: 'nonexistenttermxyz123' } });

    expect(screen.getByText('No matching topics found')).toBeDefined();
    const clearButton = screen.getByRole('button', { name: /Clear Search & Reset Filters/i });
    expect(clearButton).toBeDefined();

    fireEvent.click(clearButton);
    expect(screen.queryByText('No matching topics found')).toBeNull();
    expect(screen.getByText('TwoTab Knowledge Center')).toBeDefined();
  });

  it('expands detailed step-by-step instructions and pro tips when toggled', () => {
    render(<HelpCenterView />);

    // Find the toggle button on a guide
    const toggleButtons = screen.getAllByRole('button', { name: /View Detailed Steps & Pro Tips/i });
    expect(toggleButtons.length).toBeGreaterThan(0);

    fireEvent.click(toggleButtons[0]);
    expect(screen.getByText(/Step-by-Step Instructions:/i)).toBeDefined();
    expect(screen.getAllByText(/Pro Tip/i).length).toBeGreaterThan(0);

    // Toggle back
    const hideButton = screen.getByRole('button', { name: /Hide Detailed Steps & Tips/i });
    fireEvent.click(hideButton);
    expect(screen.queryByText(/Step-by-Step Instructions:/i)).toBeNull();
  });

  it('triggers onNavigate callback when action buttons are clicked', () => {
    const handleNavigate = vi.fn();
    render(<HelpCenterView onNavigate={handleNavigate} />);

    // Click "Back to Dashboard" button in header
    const backBtn = screen.getByRole('button', { name: /Back to Dashboard/i });
    fireEvent.click(backBtn);

    expect(handleNavigate).toHaveBeenCalledWith('dashboard');
  });

  it('renders keyboard shortcuts table with Mac and Windows combinations', () => {
    render(<HelpCenterView />);

    expect(screen.getByText(/Keyboard Shortcuts Cheatsheet/i)).toBeDefined();
    expect(screen.getAllByText('Save Current Window').length).toBeGreaterThan(0);
    expect(screen.getAllByText('⌘S').length).toBeGreaterThan(0);
    expect(screen.getByText('Ctrl+S')).toBeDefined();
  });

  it('renders right-click context menu guides', () => {
    render(<HelpCenterView />);

    expect(screen.getByText(/Right-Click Browser Context Menus/i)).toBeDefined();
    expect(screen.getByText('Save Selected Tabs')).toBeDefined();
    expect(screen.getByText('Save Link to TwoTab')).toBeDefined();
  });

  it('renders FAQ accordion and expands on click', () => {
    render(<HelpCenterView />);

    expect(screen.getByText(/Frequently Asked Questions/i)).toBeDefined();
    const faqTrigger = screen.getByText('How is TwoTab different from OneTab?');
    expect(faqTrigger).toBeDefined();

    fireEvent.click(faqTrigger);
    expect(screen.getByText(/TwoTab was built as a modern, high-performance successor to OneTab/i)).toBeDefined();
  });
});
