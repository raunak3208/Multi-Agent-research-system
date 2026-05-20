import json
import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sse_starlette.sse import EventSourceResponse
from agents import build_reader_agent, build_search_agent, writer_chain, critic_chain

app = FastAPI(title="ARIA API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve the API routes first
@app.get("/health")
def health_check():
    return {"status": "ok"}


async def research_generator(topic: str):
    state = {}
    
    try:
        # 1. Search Agent
        yield {
            "event": "message",
            "data": json.dumps({
                "agent": "search",
                "status": "running",
                "message": "Querying search indexes...",
                "detail": f"Searching for: {topic}"
            })
        }
        
        search_agent = build_search_agent()
        search_result = await search_agent.ainvoke({
            "messages" : [("user", f"Find recent, reliable and detailed information about: {topic}")]
        })
        state["search_results"] = search_result['messages'][-1].content
        
        yield {
            "event": "message",
            "data": json.dumps({
                "agent": "search",
                "status": "complete",
                "message": "Search complete",
                "detail": "Retrieved search results"
            })
        }

        # 2. Reader Agent
        yield {
            "event": "message",
            "data": json.dumps({
                "agent": "reader",
                "status": "running",
                "message": "Reading and parsing source content...",
                "detail": "Extracting structured content from sources"
            })
        }
        
        reader_agent = build_reader_agent()
        reader_result = await reader_agent.ainvoke({
            "messages": [("user",
                f"Based on the following search results about '{topic}', "
                f"pick the most relevant URL and scrape it for deeper content.\n\n"
                f"Search Results:\n{state['search_results'][:800]}"
            )]
        })

        state['scraped_content'] = reader_result['messages'][-1].content

        yield {
            "event": "message",
            "data": json.dumps({
                "agent": "reader",
                "status": "complete",
                "message": "Content extracted",
                "detail": "Finished scraping primary source"
            })
        }

        # 3. Writer Agent
        yield {
            "event": "message",
            "data": json.dumps({
                "agent": "writer",
                "status": "running",
                "message": "Synthesizing research into report...",
                "detail": "Drafting executive summary and key findings"
            })
        }

        research_combined = (
            f"SEARCH RESULTS : \n {state['search_results']} \n\n"
            f"DETAILED SCRAPED CONTENT : \n {state['scraped_content']}"
        )

        report_obj = await writer_chain.ainvoke({
            "topic" : topic,
            "research" : research_combined
        })
        
        report_text = f"Title: {report_obj.title}\nSummary: {report_obj.summary}\nFindings: {report_obj.findings}\nAnalysis: {report_obj.analysis}"

        yield {
            "event": "message",
            "data": json.dumps({
                "agent": "writer",
                "status": "complete",
                "message": "Report generated",
                "detail": f"Generated {len(report_obj.findings)} key findings"
            })
        }

        # 4. Critic Agent
        yield {
            "event": "message",
            "data": json.dumps({
                "agent": "critic",
                "status": "running",
                "message": "Reviewing and scoring the report...",
                "detail": "Evaluating accuracy and coherence"
            })
        }

        critic_obj = await critic_chain.ainvoke({
            "report": report_text
        })

        yield {
            "event": "message",
            "data": json.dumps({
                "agent": "critic",
                "status": "complete",
                "message": f"Score: {critic_obj.score}/10",
                "detail": critic_obj.verdict
            })
        }
        
        # Final payload
        final_data = {
            "agent": "system",
            "status": "complete",
            "message": "Pipeline finished",
            "report": {
                "title": report_obj.title,
                "summary": report_obj.summary,
                "findings": report_obj.findings,
                "analysis": report_obj.analysis,
                "sources": [s.model_dump() for s in report_obj.sources],
                "critic": critic_obj.model_dump(),
                "meta": {
                    "word_count": len(report_text.split())
                }
            }
        }
        
        yield {
            "event": "message",
            "data": json.dumps(final_data)
        }
    except Exception as e:
        yield {
            "event": "message",
            "data": json.dumps({
                "agent": "system",
                "status": "error",
                "message": "Pipeline error",
                "detail": str(e)
            })
        }

@app.get("/api/research/stream")
async def stream_research(topic: str):
    return EventSourceResponse(research_generator(topic))

import os
frontend_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
