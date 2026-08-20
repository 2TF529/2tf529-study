"""
browser_agent.py - Browser-Use Runner Script for Antigravity
Provides a unified CLI interface for autonomous web automation tasks.
"""

import asyncio
import argparse
import os
import sys

async def run_browser_task(task_instruction: str, start_url: str = None, headless: bool = True):
    from browser_use import Agent
    from browser_use.browser.browser import Browser, BrowserConfig
    
    # Configure Browser
    browser = Browser(
        config=BrowserConfig(
            headless=headless,
            disable_security=True,
        )
    )
    
    full_task = task_instruction
    if start_url:
        full_task = f"Navigate to {start_url} and then: {task_instruction}"
        
    print(f"[*] Starting Browser-Use Agent...")
    print(f"[*] Task: {full_task}")
    
    agent = Agent(
        task=full_task,
        browser=browser
    )
    
    try:
        history = await agent.run()
        print("[+] Task finished successfully!")
        return history
    except Exception as e:
        print(f"[-] Error running browser agent: {e}", file=sys.stderr)
        raise e
    finally:
        await browser.close()

def main():
    parser = argparse.ArgumentParser(description="Antigravity Browser-Use Runner")
    parser.add_argument("--task", type=str, required=True, help="Instruction for the browser agent")
    parser.add_argument("--url", type=str, default=None, help="Initial target URL")
    parser.add_argument("--headed", action="store_true", help="Run browser in visible (headed) mode")
    
    args = parser.parse_args()
    asyncio.run(run_browser_task(args.task, args.url, headless=not args.headed))

if __name__ == "__main__":
    main()
