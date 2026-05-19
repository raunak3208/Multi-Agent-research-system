from langchain.agents import create_agent
from langchain_mistralai import ChatMistralAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from typing import List, Optional
from pydantic import BaseModel, Field
from tools import web_search , scrape_url 
from dotenv import load_dotenv

load_dotenv()

#model setup 
llm = ChatMistralAI(model="mistral-small-latest", temperature=0)


#1st agent 
def build_search_agent():
    return create_agent(
        model = llm,
        tools= [web_search]
    )

#2nd agent 

def build_reader_agent():
    return create_agent(
        model = llm,
        tools = [scrape_url]
    )


#writer chain 

class Source(BaseModel):
    url: str = Field(description="URL of the source")
    title: str = Field(description="Title or description of the source")

class ResearchReport(BaseModel):
    title: str = Field(description="Title of the research report")
    summary: str = Field(description="An executive summary of the research (introduction and overview)")
    findings: List[str] = Field(description="List of key findings, minimum 3 points")
    analysis: str = Field(description="Deep analysis and conclusion based on the research")
    sources: List[Source] = Field(description="List of all sources found in the research")

writer_prompt = ChatPromptTemplate.from_messages([
    ("system", "You are an expert research writer. Write clear, structured and insightful reports."),
    ("human", """Write a detailed research report on the topic below.

Topic: {topic}

Research Gathered:
{research}

You must extract the information into the required JSON structure.
Be detailed, factual and professional."""),
])

writer_chain = writer_prompt | llm.with_structured_output(ResearchReport)

#critic_chain 

class CriticReview(BaseModel):
    score: int = Field(description="Score out of 10")
    verdict: str = Field(description="One line verdict of the report")
    review: str = Field(description="Detailed review including strengths and areas to improve")

critic_prompt = ChatPromptTemplate.from_messages([
     ("system", "You are a sharp and constructive research critic. Be honest and specific."),
    ("human", """Review the research report below and evaluate it strictly.

Report:
{report}

You must extract your review into the required JSON structure."""),
])

critic_chain = critic_prompt | llm.with_structured_output(CriticReview)

